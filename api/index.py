from __future__ import annotations

import hashlib
import hmac
import ipaddress
import json
from importlib.metadata import PackageNotFoundError, version
import os
import socket
import tempfile
import uuid
from pathlib import Path
from typing import Any, Literal
from urllib.parse import urlparse

import requests
from fastapi import FastAPI, Header, HTTPException, Request
from fastapi.responses import JSONResponse
from instagrapi import Client
from instagrapi.exceptions import (
    BadPassword,
    ChallengeRequired,
    ClientConnectionError,
    FeedbackRequired,
    LoginRequired,
    PleaseWaitFewMinutes,
    ProxyAddressIsBlocked,
    TwoFactorRequired,
)
from PIL import Image
from pydantic import BaseModel, Field, ValidationError

app = FastAPI(docs_url=None, redoc_url=None, openapi_url=None)

try:
    INSTAGRAPI_VERSION = version("instagrapi")
except PackageNotFoundError:
    INSTAGRAPI_VERSION = "unknown"

PHOTO_LIMIT_BYTES = 20 * 1024 * 1024
VIDEO_LIMIT_BYTES = 200 * 1024 * 1024
DOWNLOAD_TIMEOUT = (10, 120)


class LoginRequest(BaseModel):
    username: str = Field(min_length=1, max_length=30)
    password: str = Field(min_length=1)
    verification_code: str = ""
    proxy: str | None = None
    challenge_state: dict[str, Any] | None = None


class PostRequest(BaseModel):
    username: str = Field(min_length=1, max_length=30)
    session_settings: dict[str, Any]
    media_type: Literal["photo", "video"]
    media_url: str = Field(min_length=1)
    caption: str = ""
    cover_url: str | None = None
    proxy: str | None = None


def require_worker_key(x_worker_key: str | None) -> None:
    expected = os.getenv("INSTAGRAPI_WORKER_API_KEY")

    if not expected:
        raise HTTPException(
            status_code=500,
            detail={
                "code": "WORKER_KEY_MISSING",
                "message": "INSTAGRAPI_WORKER_API_KEY não configurada na Vercel",
            },
        )

    if not x_worker_key or not hmac.compare_digest(x_worker_key, expected):
        raise HTTPException(
            status_code=401,
            detail={"code": "UNAUTHORIZED", "message": "Worker não autorizado"},
        )


def api_error(status_code: int, code: str, message: str, **extra: Any) -> None:
    raise HTTPException(
        status_code=status_code,
        detail={"code": code, "message": message, **extra},
    )


def normalize_proxy(proxy: str | None) -> str | None:
    if not proxy:
        return None

    value = proxy.strip()
    if not value:
        return None

    if value.startswith(("http://", "https://", "socks4://", "socks5://", "socks5h://")):
        return value

    parts = value.split(":")
    if len(parts) == 4:
        host, port, username, password = parts
        return f"http://{username}:{password}@{host}:{port}"
    if len(parts) == 2:
        return f"http://{value}"
    if "@" in value:
        return f"http://{value}"

    return f"http://{value}"


BRAZIL_DEVICE = {
    "android_version": 34,
    "android_release": "14",
    "dpi": "420dpi",
    "resolution": "1080x2400",
    "manufacturer": "samsung",
    "device": "a54x",
    "model": "SM-A546E",
    "cpu": "exynos1380",
}


def stable_uuid(username: str, name: str) -> str:
    secret = (
        os.getenv("INSTAGRAM_SESSION_SECRET")
        or os.getenv("INSTAGRAPI_WORKER_API_KEY")
        or "instagram-saas"
    )
    digest = hashlib.sha256(f"{secret}:{username}:{name}".encode("utf-8")).hexdigest()
    return str(uuid.UUID(digest[:32]))


def stable_uuids(username: str) -> dict[str, str]:
    device_hash = hashlib.sha256(
        f"{username}:{stable_uuid(username, 'device')}".encode("utf-8")
    ).hexdigest()[:16]
    return {
        "phone_id": stable_uuid(username, "phone"),
        "uuid": stable_uuid(username, "uuid"),
        "client_session_id": stable_uuid(username, "session"),
        "advertising_id": stable_uuid(username, "advertising"),
        "device_id": f"android-{device_hash}",
    }


def create_login_client(
    username: str,
    proxy: str | None = None,
    challenge_state: dict[str, Any] | None = None,
) -> Client:
    client = Client()
    client.request_timeout = 30

    if challenge_state:
        client.set_settings(challenge_state)
    else:
        client.set_uuids(stable_uuids(username))
        client.set_device(BRAZIL_DEVICE)

    client.set_country("BR")
    client.set_country_code(55)
    client.set_locale("pt_BR")
    client.set_timezone_offset(-3 * 60 * 60)

    normalized_proxy = normalize_proxy(proxy or os.getenv("INSTAGRAM_DEFAULT_PROXY"))
    if normalized_proxy:
        client.set_proxy(normalized_proxy)

    return client


def create_session_client(
    session_settings: dict[str, Any],
    proxy: str | None = None,
) -> Client:
    if not session_settings:
        raise LoginRequired("Sessão não informada")

    client = Client()
    client.set_settings(session_settings)
    client.request_timeout = 30

    normalized_proxy = normalize_proxy(proxy)
    if normalized_proxy:
        client.set_proxy(normalized_proxy)

    authorization_data = session_settings.get("authorization_data") or {}
    cookies = session_settings.get("cookies") or {}
    session_id = authorization_data.get("sessionid") or cookies.get("sessionid")

    if not session_id:
        raise LoginRequired("A sessão não possui sessionid")

    client.login_by_sessionid(str(session_id))
    return client


def get_challenge_state(client: Client) -> dict[str, Any]:
    try:
        settings = client.get_settings()
        return json.loads(json.dumps(settings, default=str))
    except Exception:
        return {}


def looks_like_two_factor_error(
    client: Client,
    error: Exception,
    verification_code: str | None,
) -> bool:
    try:
        last_json = getattr(client, "last_json", {}) or {}
        raw = json.dumps(last_json, ensure_ascii=False, default=str)
    except Exception:
        raw = ""

    message = f"{error.__class__.__name__} {error} {raw}".lower()
    markers = (
        "twofactor",
        "two_factor",
        "two-factor",
        "two factor",
        "two_step_verification",
        "two step verification",
        "verification_code",
        "verification code",
        "totp",
        "backup_code",
        "backup code",
    )

    if any(marker in message for marker in markers):
        return True

    return bool(
        verification_code
        and "invalid parameters" in message
        and "two_step_verification_context" in message
    )


def two_factor_error(client: Client, verification_code: str | None) -> None:
    state = get_challenge_state(client)

    if verification_code:
        api_error(
            401,
            "TWO_FACTOR_INVALID",
            "Código 2FA inválido ou expirado. Gere um novo código no autenticador e tente novamente.",
            challenge_state=state,
        )

    api_error(
        409,
        "TWO_FACTOR_REQUIRED",
        "Digite o código de 6 dígitos do aplicativo autenticador ou um código de backup de 8 dígitos.",
        challenge_state=state,
    )


def login_instagram_account(payload: dict[str, Any]) -> dict[str, Any]:
    try:
        login_request = LoginRequest.model_validate(payload)
    except ValidationError:
        api_error(400, "INVALID_LOGIN", "Informe o usuário e a senha do Instagram")

    username = login_request.username.strip().lstrip("@").lower()
    verification_code = (login_request.verification_code or "").strip()

    if verification_code and len(verification_code) not in (6, 8):
        api_error(
            400,
            "INVALID_TWO_FACTOR_FORMAT",
            "O código do autenticador deve ter 6 dígitos; o código de backup deve ter 8 dígitos.",
            challenge_state=login_request.challenge_state or {},
        )

    client = create_login_client(
        username,
        login_request.proxy,
        login_request.challenge_state,
    )

    try:
        logged = client.login(
            username,
            login_request.password,
            verification_code=verification_code,
        )

        if not logged:
            api_error(
                401,
                "LOGIN_REJECTED",
                "O Instagram recusou o login. Confirme o acesso no aplicativo oficial e tente novamente.",
            )

        account = client.account_info()

        return {
            "message": "Login realizado com sucesso",
            "account": {
                "id": str(account.pk),
                "username": account.username,
                "full_name": getattr(account, "full_name", None),
                "profile_picture": str(account.profile_pic_url)
                if getattr(account, "profile_pic_url", None)
                else None,
                "follower_count": getattr(account, "follower_count", None),
            },
            "session": client.get_settings(),
        }
    except TwoFactorRequired:
        two_factor_error(client, verification_code)
    except ChallengeRequired:
        api_error(
            409,
            "CHALLENGE_REQUIRED",
            "O Instagram pediu uma verificação adicional. Abra o aplicativo oficial, confirme que foi você e tente novamente sem trocar de rede ou proxy.",
            challenge_state=get_challenge_state(client),
        )
    except BadPassword:
        last_json = getattr(client, "last_json", {}) or {}
        error_type = str(last_json.get("error_type") or "").lower()
        message = str(last_json.get("message") or "").lower()

        if not normalize_proxy(login_request.proxy or os.getenv("INSTAGRAM_DEFAULT_PROXY")):
            api_error(
                409,
                "NETWORK_TRUST_REJECTED",
                "O Instagram recusou o login vindo do IP da Vercel. Confirme que a senha funciona no aplicativo e tente novamente após o novo deploy em São Paulo. Se continuar, informe um proxy residencial brasileiro estável para esta conta.",
                instagram_error_type=error_type or None,
                instagram_message=message or None,
            )

        api_error(
            401,
            "BAD_PASSWORD",
            "O Instagram recusou o usuário ou a senha através do proxy informado. Confirme as credenciais e verifique se o proxy é residencial, brasileiro e exclusivo para esta conta.",
            instagram_error_type=error_type or None,
            instagram_message=message or None,
        )
    except PleaseWaitFewMinutes:
        api_error(
            429,
            "PLEASE_WAIT",
            "O Instagram bloqueou novas tentativas temporariamente. Aguarde alguns minutos antes de tentar novamente.",
        )
    except FeedbackRequired:
        api_error(
            429,
            "FEEDBACK_REQUIRED",
            "O Instagram restringiu este login temporariamente. Verifique a conta no aplicativo oficial antes de tentar novamente.",
        )
    except ProxyAddressIsBlocked:
        api_error(
            403,
            "PROXY_BLOCKED",
            "O Instagram bloqueou o endereço IP ou proxy utilizado.",
        )
    except ClientConnectionError:
        api_error(
            502,
            "CONNECTION_ERROR",
            "Não foi possível conectar ao Instagram. Verifique a rede ou o proxy informado.",
        )
    except Exception as error:
        if looks_like_two_factor_error(client, error, verification_code):
            two_factor_error(client, verification_code)

        message = str(error).strip()
        error_name = error.__class__.__name__
        api_error(
            500,
            "LOGIN_ERROR",
            f"Falha no login do Instagram ({error_name})"
            + (f": {message}" if message else ""),
        )


def _ensure_public_https_url(url: str) -> None:
    parsed = urlparse(url)

    if parsed.scheme != "https" or not parsed.hostname:
        raise ValueError("A mídia precisa usar uma URL HTTPS pública")

    addresses = socket.getaddrinfo(parsed.hostname, parsed.port or 443, type=socket.SOCK_STREAM)
    for address in addresses:
        ip = ipaddress.ip_address(address[4][0])
        if (
            ip.is_private
            or ip.is_loopback
            or ip.is_link_local
            or ip.is_multicast
            or ip.is_reserved
            or ip.is_unspecified
        ):
            raise ValueError("URL de mídia não permitida")


def download_media(url: str, media_type: str) -> Path:
    _ensure_public_https_url(url)

    is_video = media_type == "video"
    maximum_size = VIDEO_LIMIT_BYTES if is_video else PHOTO_LIMIT_BYTES
    suffix = ".mp4" if is_video else ".img"

    response = requests.get(
        url,
        stream=True,
        allow_redirects=True,
        timeout=DOWNLOAD_TIMEOUT,
        headers={"User-Agent": "InstagramSaaSWorker/1.0"},
    )
    response.raise_for_status()
    _ensure_public_https_url(response.url)

    content_length = response.headers.get("Content-Length")
    if content_length and int(content_length) > maximum_size:
        raise ValueError("Arquivo maior que o limite permitido")

    content_type = response.headers.get("Content-Type", "").lower()
    if is_video and content_type and not content_type.startswith("video/"):
        raise ValueError("A URL não retornou um vídeo válido")
    if not is_video and content_type and not content_type.startswith("image/"):
        raise ValueError("A URL não retornou uma imagem válida")

    fd, temporary_path = tempfile.mkstemp(suffix=suffix)
    total = 0

    try:
        with os.fdopen(fd, "wb") as file:
            for chunk in response.iter_content(chunk_size=1024 * 1024):
                if not chunk:
                    continue
                total += len(chunk)
                if total > maximum_size:
                    raise ValueError("Arquivo maior que o limite permitido")
                file.write(chunk)
    except Exception:
        Path(temporary_path).unlink(missing_ok=True)
        raise

    return Path(temporary_path)


def convert_to_jpeg(source_path: Path) -> Path:
    fd, output_path = tempfile.mkstemp(suffix=".jpg")
    os.close(fd)
    destination = Path(output_path)

    try:
        with Image.open(source_path) as image:
            image.convert("RGB").save(destination, format="JPEG", quality=95)
        return destination
    except Exception:
        destination.unlink(missing_ok=True)
        raise


def post_photo(client: Client, image_path: Path, caption: str):
    jpeg_path: Path | None = None

    try:
        jpeg_path = convert_to_jpeg(image_path)
        return client.photo_upload(jpeg_path, caption=caption)
    finally:
        if jpeg_path:
            jpeg_path.unlink(missing_ok=True)
        image_path.unlink(missing_ok=True)


def post_reel(client: Client, video_path: Path, caption: str, cover_path: Path):
    jpeg_cover_path: Path | None = None

    try:
        jpeg_cover_path = convert_to_jpeg(cover_path)
        return client.clip_upload(
            video_path,
            caption=caption,
            thumbnail=jpeg_cover_path,
        )
    finally:
        if jpeg_cover_path:
            jpeg_cover_path.unlink(missing_ok=True)
        cover_path.unlink(missing_ok=True)
        video_path.unlink(missing_ok=True)


def publish_instagram_post(payload: dict[str, Any]) -> dict[str, Any]:
    try:
        post_request = PostRequest.model_validate(payload)
    except ValidationError as error:
        api_error(400, "INVALID_POST", f"Dados de publicação inválidos: {error}")

    if post_request.media_type == "video" and not post_request.cover_url:
        api_error(400, "COVER_REQUIRED", "A capa é obrigatória para publicar um Reel")

    try:
        client = create_session_client(post_request.session_settings, post_request.proxy)
        media_path = download_media(post_request.media_url, post_request.media_type)

        if post_request.media_type == "photo":
            media = post_photo(client, media_path, post_request.caption)
        else:
            cover_path = download_media(str(post_request.cover_url), "photo")
            media = post_reel(client, media_path, post_request.caption, cover_path)

        return {
            "message": "Conteúdo publicado com sucesso",
            "result": {
                "pk": str(media.pk),
                "code": media.code,
            },
            "session": client.get_settings(),
        }
    except LoginRequired:
        api_error(
            401,
            "SESSION_EXPIRED",
            "A sessão do Instagram expirou. Reconecte a conta e tente novamente.",
        )
    except ChallengeRequired:
        api_error(
            409,
            "CHALLENGE_REQUIRED",
            "O Instagram pediu uma verificação adicional. Abra o aplicativo oficial, confirme o acesso e reconecte a conta.",
        )
    except PleaseWaitFewMinutes:
        api_error(
            429,
            "PLEASE_WAIT",
            "O Instagram limitou temporariamente as publicações desta conta.",
        )
    except FeedbackRequired:
        api_error(
            429,
            "FEEDBACK_REQUIRED",
            "O Instagram bloqueou temporariamente a publicação desta conta.",
        )
    except ProxyAddressIsBlocked:
        api_error(
            403,
            "PROXY_BLOCKED",
            "O Instagram bloqueou o endereço IP ou proxy utilizado.",
        )
    except ClientConnectionError:
        api_error(
            502,
            "CONNECTION_ERROR",
            "Não foi possível conectar ao Instagram. Verifique a rede ou o proxy informado.",
        )
    except ValueError as error:
        api_error(400, "INVALID_MEDIA", str(error))
    except Exception as error:
        message = str(error).strip()
        api_error(
            500,
            "PUBLISH_ERROR",
            f"Erro ao publicar no Instagram ({error.__class__.__name__})"
            + (f": {message}" if message else ""),
        )


@app.exception_handler(Exception)
async def unhandled_exception_handler(_: Request, error: Exception):
    message = str(error).strip()
    return JSONResponse(
        status_code=500,
        content={
            "detail": {
                "code": "PYTHON_FUNCTION_ERROR",
                "message": f"Falha interna da função Python ({error.__class__.__name__})"
                + (f": {message}" if message else ""),
            }
        },
    )


@app.get("/{path:path}")
def health(path: str = ""):
    return {
        "status": "ok",
        "message": "Instagrapi Python Function is running",
        "instagrapi": INSTAGRAPI_VERSION,
    }


@app.post("/{path:path}")
async def handle_worker_request(
    request: Request,
    path: str = "",
    x_worker_key: str | None = Header(default=None),
):
    require_worker_key(x_worker_key)

    try:
        payload = await request.json()
    except Exception:
        api_error(400, "INVALID_JSON", "Corpo da requisição inválido")

    action = str(payload.get("action") or "").strip().lower()

    if action == "login":
        return login_instagram_account(payload)

    if action == "post":
        return publish_instagram_post(payload)

    api_error(400, "INVALID_ACTION", "Ação do worker inválida")
