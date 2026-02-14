from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.database import get_db
from app.models.environment import Environment, EnvironmentVariable, EnvironmentType
from app.models.user import User
from app.schemas.environment import EnvironmentCreate, EnvironmentOut

router = APIRouter()


class EnvironmentUpdate(BaseModel):
    name: str | None = None
    env_type: EnvironmentType | None = None


class VariableUpsert(BaseModel):
    key: str
    value: str = ""
    is_secret: bool = False


@router.post("/", response_model=EnvironmentOut, status_code=status.HTTP_201_CREATED)
def create_environment(
    payload: EnvironmentCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    env = Environment(
        name=payload.name,
        env_type=payload.env_type,
        workspace_id=payload.workspace_id,
    )
    db.add(env)
    db.flush()

    if payload.variables:
        for var in payload.variables:
            db.add(EnvironmentVariable(
                environment_id=env.id,
                key=var.key,
                value=var.value,
                is_secret=var.is_secret,
            ))

    db.commit()
    db.refresh(env)
    return env


@router.get("/", response_model=list[EnvironmentOut])
def list_environments(
    workspace_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return (
        db.query(Environment)
        .filter(Environment.workspace_id == workspace_id)
        .all()
    )


@router.get("/{environment_id}", response_model=EnvironmentOut)
def get_environment(
    environment_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    env = db.query(Environment).filter(Environment.id == environment_id).first()
    if not env:
        raise HTTPException(status_code=404, detail="Environment not found")
    return env


@router.patch("/{environment_id}", response_model=EnvironmentOut)
def update_environment(
    environment_id: str,
    payload: EnvironmentUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    env = db.query(Environment).filter(Environment.id == environment_id).first()
    if not env:
        raise HTTPException(status_code=404, detail="Environment not found")
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(env, field, value)
    db.commit()
    db.refresh(env)
    return env


@router.delete("/{environment_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_environment(
    environment_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    env = db.query(Environment).filter(Environment.id == environment_id).first()
    if not env:
        raise HTTPException(status_code=404, detail="Environment not found")
    db.delete(env)
    db.commit()


@router.put("/{environment_id}/variables", response_model=EnvironmentOut)
def set_variables(
    environment_id: str,
    variables: list[VariableUpsert],
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    env = db.query(Environment).filter(Environment.id == environment_id).first()
    if not env:
        raise HTTPException(status_code=404, detail="Environment not found")

    # Delete old variables
    db.query(EnvironmentVariable).filter(
        EnvironmentVariable.environment_id == environment_id
    ).delete()

    # Insert new
    for var in variables:
        db.add(EnvironmentVariable(
            environment_id=environment_id,
            key=var.key,
            value=var.value,
            is_secret=var.is_secret,
        ))

    db.commit()
    db.refresh(env)
    return env
