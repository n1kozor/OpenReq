"""Service for building public share documentation data."""

from datetime import datetime, timezone

from sqlalchemy.orm import Session

from app.models.collection import Collection, CollectionItem
from app.models.collection_share import CollectionShare
from app.services.doc_generator import (
    _collect_requests_with_structure,
    _build_endpoint_data,
)


def _build_folder_tree(endpoints: list[dict]) -> list[dict]:
    """Build a nested folder tree from flat endpoint list (using folder paths)."""
    root_children: dict[str, dict] = {}
    root_endpoints: list[int] = []

    for ep in endpoints:
        folder = ep.get("folder", "")
        if not folder:
            root_endpoints.append(ep["index"])
            continue

        parts = folder.split("/")
        current = root_children
        for depth, part in enumerate(parts):
            if part not in current:
                current[part] = {"name": part, "endpoints": [], "children": {}}
            if depth == len(parts) - 1:
                current[part]["endpoints"].append(ep["index"])
            current = current[part]["children"]

    def _to_list(children_dict: dict) -> list[dict]:
        result = []
        for name, node in children_dict.items():
            result.append({
                "name": node["name"],
                "endpoints": node["endpoints"],
                "children": _to_list(node["children"]),
            })
        return result

    tree = _to_list(root_children)
    if root_endpoints:
        tree.insert(0, {
            "name": "",
            "endpoints": root_endpoints,
            "children": [],
        })
    return tree


def get_share_docs_data(db: Session, share: CollectionShare) -> dict:
    """Build read-only documentation data for a share."""
    collection = share.collection
    parent_id = share.folder_id

    requests_list = _collect_requests_with_structure(
        db, collection.id, parent_id
    )
    endpoints = _build_endpoint_data(requests_list)

    folder_tree = _build_folder_tree(endpoints)

    return {
        "title": share.title or collection.name,
        "description": share.description_override or collection.description,
        "endpoint_count": len(endpoints),
        "endpoints": endpoints,
        "folder_tree": folder_tree,
        "generated_at": datetime.now(timezone.utc).isoformat(),
    }


def get_share_endpoint_count(db: Session, share: CollectionShare) -> int:
    """Quick count of endpoints in a share (without building full data)."""
    requests_list = _collect_requests_with_structure(
        db, share.collection_id, share.folder_id
    )
    return len(requests_list)
