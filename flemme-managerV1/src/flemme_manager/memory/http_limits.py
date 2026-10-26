"""Bound the canonical JSON surface before validation, including chunked bodies."""
from starlette.responses import JSONResponse


class ManagerBodyLimit:
    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope['type'] != 'http' or not scope['path'].startswith('/api/manager'):
            return await self.app(scope, receive, send)
        original_send = send
        async def private_send(message):
            if message['type'] == 'http.response.start':
                message = dict(message)
                message['headers'] = [(key, value) for key, value in message.get('headers', [])
                                      if key.lower() not in {b'cache-control', b'x-content-type-options'}]
                message['headers'] += [(b'cache-control', b'no-store'), (b'x-content-type-options', b'nosniff')]
            await original_send(message)
        send = private_send
        limit = 4_100_000 if scope['path'].endswith(('/missions', '/plans')) else 64_000
        chunks, size = [], 0
        while True:
            message = await receive()
            if message['type'] == 'http.disconnect':
                return
            chunk = message.get('body', b'')
            size += len(chunk)
            if size > limit:
                return await JSONResponse({'detail': 'Requête trop volumineuse.'}, 413)(scope, receive, send)
            chunks.append(chunk)
            if not message.get('more_body', False):
                break
        sent = False
        async def bounded_receive():
            nonlocal sent
            if sent:
                return await receive()
            sent = True
            return {'type': 'http.request', 'body': b''.join(chunks), 'more_body': False}
        await self.app(scope, bounded_receive, send)
