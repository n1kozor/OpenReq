from fastapi import APIRouter

from app.api.v1 import (
    auth, users, workspaces, collections, requests, environments,
    proxy, history, ai, import_export, codegen, oauth, websocket_proxy, sdk,
    setup, app_settings, collection_runs, network, ai_chat, test_flows,
)

api_router = APIRouter(prefix="/api/v1")

api_router.include_router(auth.router, prefix="/auth", tags=["Auth"])
api_router.include_router(users.router, prefix="/users", tags=["Users"])
api_router.include_router(workspaces.router, prefix="/workspaces", tags=["Workspaces"])
api_router.include_router(collections.router, prefix="/collections", tags=["Collections"])
api_router.include_router(requests.router, prefix="/requests", tags=["Requests"])
api_router.include_router(environments.router, prefix="/environments", tags=["Environments"])
api_router.include_router(proxy.router, prefix="/proxy", tags=["Proxy"])
api_router.include_router(history.router, prefix="/history", tags=["History"])
api_router.include_router(ai.router, prefix="/ai", tags=["AI"])
api_router.include_router(import_export.router, prefix="/import-export", tags=["Import/Export"])
api_router.include_router(codegen.router, prefix="/codegen", tags=["Code Generation"])
api_router.include_router(sdk.router, prefix="/sdk", tags=["SDK Generation"])
api_router.include_router(oauth.router, prefix="/oauth", tags=["OAuth"])
api_router.include_router(websocket_proxy.router, tags=["WebSocket"])
api_router.include_router(setup.router, prefix="/setup", tags=["Setup"])
api_router.include_router(app_settings.router, prefix="/settings", tags=["Settings"])
api_router.include_router(collection_runs.router, prefix="/runs", tags=["Collection Runs"])
api_router.include_router(network.router, prefix="/network", tags=["Network"])
api_router.include_router(ai_chat.router, prefix="/ai/chat", tags=["AI Chat"])
api_router.include_router(test_flows.router, prefix="/test-flows", tags=["Test Flows"])
