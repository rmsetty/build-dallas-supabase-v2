"""Use Workers fetch for existing httpx integrations; CPython keeps native HTTP."""

import httpx


class FetchTransport(httpx.AsyncBaseTransport):
    async def handle_async_request(self, request):
        from js import AbortSignal, fetch
        from pyodide.ffi import to_js

        from app.storage.cloudflare import js_options

        options = {
            "method": request.method,
            "headers": dict(request.headers),
            "redirect": "manual",
        }
        options["signal"] = AbortSignal.timeout(15_000)
        body = await request.aread()
        if body:
            options["body"] = to_js(body)
        try:
            response = await fetch(str(request.url), js_options(options))
            content = bytes((await response.arrayBuffer()).to_py())
            headers = [(str(k), str(v)) for k, v in response.headers.entries()]
            return httpx.Response(
                response.status, headers=headers, content=content, request=request
            )
        except Exception as exc:
            raise httpx.ConnectError(
                "Worker upstream request failed", request=request
            ) from exc


def worker_transport():
    import sys

    return FetchTransport() if sys.platform == "emscripten" else None
