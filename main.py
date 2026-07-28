from __future__ import annotations

import hmac
import os
from typing import Any, Literal

from fastapi import Depends, FastAPI, Header, HTTPException
from instagrapi.exceptions import (
    BadPassword,
    ChallengeRequired,
    FeedbackRequired,
    LoginRequired,
    PleaseWaitFewMinutes,
    ProxyError,
    TwoFactorRequired,
)
from pydantic import BaseModel, Field

from worker import (
    create_login_client,
    create_session_client,
    download_media,
    post_photo,
    post_reel,
)

app = FastAPI(title="Instagram SaaS Worker")


class LoginRequest(BaseModel):
    username: str = Field(min_length=1, max_length=30)
    password: str = Field(min_length=1)
    verification_code: str | None = None
    proxy: str | None = None


class PostRequest(BaseModel):
    username: str = Field(min_length=1, max_length=30)
    session_settings: dict[str, Any]
    media_type: Literal["photo", "video"]
    media_url: str
    caption: str = ""
    cover_url: str | None = None
    proxy: str | None = None


def require_worker_key(x_worker_key: str | None = Header(default=None)):
    expected = os.getenv("INSTAGRAPI_WORKER_API_KEY")

    if expected and (
        not x_worker_key or not hmac.compare_digest(x_worker_key, expected)
    ):
        raise HTTPException(status_code=401, detail="Worker não autorizado")


def api_error(status_code: int, code: str, message: str):
    raise HTTPException(
        status_code=status_code,
        detail={"code": code, "message": message},
    )


@app.get("/")
def root():
    return {"status": "ok", "message": "Instagrapi Worker is running"}


@app.get("/health")
def health():
    return {"status": "ok"}


@app.post("/login", dependencies=[Depends(require_worker_key)])
def login_instagram_account(request: LoginRequest):
    username = request.username.strip().lstrip("@").lower()
    verification_code = (request.verification_code or "").strip() or None
    client = create_login_client(request.proxy)

    try:
        client.login(
            username,
            request.password,
            verification_code=verification_code,
        )
        account = client.account_info()

        return {
            "message": "Login realizado com sucesso",
            "account": {
                "id": str(account.pk),
                "username": account.username,
                "full_name": getattr(account, "full_name", None),
                "profile_picture": str(account.profile_pic_url) if getattr(account, "profile_pic_url", None) else None,
                "follower_count": getattr(account, "follower_count", None),
            },
            "session": client.get_settings(),
        }
    except TwoFactorRequired:
        api_error(
            409,
            "TWO_FACTOR_REQUIRED",
            "Digite o código do aplicativo autenticador do Instagram",
        )
    except ChallengeRequired:
        api_error(
            409,
            "CHALLENGE_REQUIRED",
            "O Instagram pediu uma verificação adicional. Confirme o acesso no aplicativo oficial e tente novamente mantendo o mesmo proxy.",
        )
    except BadPassword:
        api_error(401, "BAD_PASSWORD", "Usuário ou senha do Instagram incorretos")
    except PleaseWaitFewMinutes:
        api_error(
            429,
            "PLEASE_WAIT",
            "O Instagram bloqueou novas tentativas temporariamente. Aguarde antes de tentar novamente.",
        )
    except FeedbackRequired:
        api_error(
            429,
            "FEEDBACK_REQUIRED",
            "O Instagram restringiu esta ação temporariamente. Verifique a conta no aplicativo oficial.",
        )
    except ProxyError:
        api_error(400, "PROXY_ERROR", "Não foi possível conectar usando o proxy informado")
    except Exception as error:
        api_error(500, "LOGIN_ERROR", f"Não foi possível conectar a conta: {error}")


@app.post("/post", dependencies=[Depends(require_worker_key)])
def publish_instagram_post(request: PostRequest):
    if request.media_type == "video" and not request.cover_url:
        api_error(400, "COVER_REQUIRED", "A capa é obrigatória para publicar um Reel")

    try:
        client = create_session_client(request.session_settings, request.proxy)
        media_path = download_media(request.media_url, request.media_type)

        if request.media_type == "photo":
            media = post_photo(client, media_path, request.caption)
        else:
            cover_path = download_media(str(request.cover_url), "photo")
            media = post_reel(client, media_path, request.caption, cover_path)

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
    except ProxyError:
        api_error(400, "PROXY_ERROR", "Não foi possível publicar usando o proxy configurado")
    except ValueError as error:
        api_error(400, "INVALID_MEDIA", str(error))
    except Exception as error:
        api_error(500, "PUBLISH_ERROR", f"Erro ao publicar no Instagram: {error}")


if __name__ == "__main__":
    import uvicorn

    port = int(os.environ.get("PORT", 8080))
    uvicorn.run(app, host="0.0.0.0", port=port)
