"""Exact browser origins and no shared caching of authenticated responses."""
from urllib.parse import urlparse
from fastapi.middleware.cors import CORSMiddleware


def configure_browser_access(app, value):
    origins = [origin.strip() for origin in value.split(',') if origin.strip()]
    for origin in origins:
        parsed = urlparse(origin)
        if (parsed.scheme != 'https' or not parsed.netloc or parsed.path or parsed.query
                or parsed.fragment or parsed.username or '*' in origin):
            raise ValueError('Browser access requires exact HTTPS origins')
    if origins:
        app.add_middleware(CORSMiddleware, allow_origins=origins, allow_methods=['GET', 'POST'],
                           allow_headers=['Authorization', 'Content-Type'], allow_credentials=False)

    @app.middleware('http')
    async def private_memory(request, call_next):
        response = await call_next(request)
        if request.url.path.startswith(('/api/v2/', '/api/v3/')):
            response.headers['Cache-Control'] = 'private, no-store'
        return response
