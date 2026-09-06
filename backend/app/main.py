import logging
from contextlib import asynccontextmanager

logging.basicConfig(level=logging.INFO,
                    format="%(asctime)s %(levelname)s %(name)s %(message)s")

from fastapi import FastAPI

from app.api.routes import (accounts, auth, centers, depots, dispatch, drivers,
                            plan, plans, reports, roads, sites)
from app.services.routing import load_graph_on_startup


@asynccontextmanager
async def lifespan(app: FastAPI):
    from app.core.config import settings
    if settings.JWT_SECRET in ("change_me", "MADAD_SECRET_TOKEN_VALUE", ""):
        logging.getLogger("madad").warning(
            "JWT_SECRET is a default/weak value — tokens are forgeable. "
            "Set a strong JWT_SECRET in backend/.env before any real deployment.")
    load_graph_on_startup()  # fail loudly at startup if the graph file is missing
    yield


app = FastAPI(title="MADAD Backend", version="1.1.0", lifespan=lifespan)

for router in (auth.router, accounts.router, centers.router, depots.router,
               reports.router, sites.router, plan.router, plans.router, roads.router,
               dispatch.router, drivers.router):
    app.include_router(router)


@app.get("/api/health")
def health():
    return {"status": "ok"}
