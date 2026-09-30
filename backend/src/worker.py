"""Python Workers ASGI entrypoint; bindings flow through request.scope['env']."""

from app.main import app
from workers import WorkerEntrypoint


class Default(WorkerEntrypoint):
    async def fetch(self, request):
        import asgi

        return await asgi.fetch(app, request.js_object, self.env)

    async def scheduled(self, controller, env, ctx):
        from app.services.for_you import ForYouService
        from app.storage.cloudflare import CloudStorage

        # The cron never touches the edge cache, so the origin is only a placeholder.
        storage = CloudStorage(self.env, "https://scheduled.invalid")
        print("for-you sync", await ForYouService(storage).sync_catalog())
