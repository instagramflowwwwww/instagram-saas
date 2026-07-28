from __future__ import annotations

import ipaddress
import os
import socket
import tempfile
from pathlib import Path
from typing import Any
from urllib.parse import urlparse

import requests
from PIL import Image
from instagrapi import Client
from instagrapi.exceptions import LoginRequired

PHOTO_LIMIT_BYTES = 20 * 1024 * 1024
VIDEO_LIMIT_BYTES = 200 * 1024 * 1024
DOWNLOAD_TIMEOUT = (10, 120)


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


def create_login_client(proxy: str | None = None) -> Client:
    client = Client()
    client.request_timeout = 30

    normalized_proxy = normalize_proxy(proxy)
    if normalized_proxy:
        client.set_proxy(normalized_proxy)

    return client


def create_session_client(session_settings: dict[str, Any], proxy: str | None = None) -> Client:
    if not session_settings:
        raise LoginRequired("Sessão não informada")

    client = Client(session_settings)
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
