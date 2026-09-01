from contextlib import asynccontextmanager

from fastapi import FastAPI

from app.api.routes import (accounts, auth, centers, depots, dispatch, plan,
                            reports, roads, sites)
from app.services.routing import load_graph_on_startup


@asynccontextmanager
async def lifespan(app: FastAPI):
    load_graph_on_startup()  # fail loudly at startup if the graph file is missing
    yield


app = FastAPI(title="MADAD Backend", version="1.1.0", lifespan=lifespan)

for router in (auth.router, accounts.router, centers.router, depots.router,
               reports.router, sites.router, plan.router, roads.router, dispatch.router):
    app.include_router(router)


@app.get("/api/health")
def health():
    return {"status": "ok"}
