from __future__ import annotations

import hashlib
import hmac
import json
import os
from typing import Any, Dict, Iterable


class ProofBuildError(ValueError):
    """Raised when proof generation fails."""


class ProofBuilder:
    """Build canonical payload and hash from component proof DSL."""

    def build(self, component: Dict[str, Any], execution_payload: Dict[str, Any]) -> Dict[str, Any]:
        return build_proof(component=component, execution_payload=execution_payload)


def build_proof(component: Dict[str, Any], execution_payload: Dict[str, Any]) -> Dict[str, Any]:
    proof_cfg = component.get("proof", {})
    if not isinstance(proof_cfg, dict):
        raise ProofBuildError("component.proof must be a dict")

    proof_fields = _string_list(proof_cfg.get("proof_fields", []))
    canonicalization = proof_cfg.get("canonicalization", {})
    if not isinstance(canonicalization, dict):
        canonicalization = {}

    canonical_order = _string_list(
        canonicalization.get(
            "field_order",
            proof_cfg.get("canonical_order", proof_cfg.get("canonical_payload_order", [])),
        )
    )
    if "v_address" in execution_payload:
        if "v_address" not in proof_fields:
            proof_fields.append("v_address")
        if "v_address" not in canonical_order:
            canonical_order.append("v_address")
    if "spec_anchor" in execution_payload:
        if "spec_anchor" not in proof_fields:
            proof_fields.append("spec_anchor")
        if "spec_anchor" not in canonical_order:
            canonical_order.append("spec_anchor")
    sort_keys = bool(canonicalization.get("sort_keys", True))
    null_policy = str(canonicalization.get("null_policy", "keep")).strip().lower()
    if null_policy not in {"keep", "drop"}:
        raise ProofBuildError(f"unsupported null_policy: {null_policy}")

    hash_method = str(proof_cfg.get("hash_algorithm", proof_cfg.get("hash_method", "sha256"))).lower()

    canonical_payload = _build_canonical_payload(
        execution_payload=execution_payload,
        canonical_order=canonical_order,
        proof_fields=proof_fields,
        null_policy=null_policy,
    )

    proof_hash = _hash_payload(canonical_payload, hash_method, sort_keys=sort_keys)
    signature, signature_algorithm = _sign_payload(proof_cfg, proof_hash)

    payload = {
        "proof_hash": proof_hash,
        "hash_method": hash_method,
        "canonical_payload": canonical_payload,
        "proof_fields": proof_fields,
        "signature": signature,
        "signature_algorithm": signature_algorithm,
    }
    if "spec_anchor" in execution_payload:
        payload["spec_anchor"] = execution_payload["spec_anchor"]
    return payload


def _build_canonical_payload(
    execution_payload: Dict[str, Any],
    canonical_order: Iterable[str],
    proof_fields: Iterable[str],
    null_policy: str,
) -> Dict[str, Any]:
    payload: Dict[str, Any] = {}

    for field in canonical_order:
        if field in execution_payload:
            value = execution_payload[field]
            if null_policy == "drop" and value is None:
                continue
            payload[field] = value

    for field in proof_fields:
        if field in payload:
            continue
        if field in execution_payload:
            value = execution_payload[field]
            if null_policy == "drop" and value is None:
                continue
            payload[field] = value

    return payload


def _hash_payload(payload: Dict[str, Any], hash_method: str, *, sort_keys: bool) -> str:
    body = json.dumps(payload, ensure_ascii=False, sort_keys=sort_keys, separators=(",", ":")).encode("utf-8")

    if hash_method == "sha256":
        return hashlib.sha256(body).hexdigest()
    if hash_method == "sha3_256":
        return hashlib.sha3_256(body).hexdigest()
    if hash_method == "blake3":
        try:
            import blake3  # type: ignore
        except ImportError as exc:
            raise ProofBuildError("blake3 hash_algorithm requires blake3 package") from exc
        return blake3.blake3(body).hexdigest()

    raise ProofBuildError(f"unsupported hash_algorithm: {hash_method}")


def _string_list(raw: Any) -> list[str]:
    if not isinstance(raw, list):
        return []
    return [item for item in raw if isinstance(item, str) and item]


def _sign_payload(proof_cfg: Dict[str, Any], proof_hash: str) -> tuple[str | None, str | None]:
    signature_cfg = proof_cfg.get("signature")
    if not isinstance(signature_cfg, dict):
        return None, None

    algorithm = str(signature_cfg.get("algorithm", "hmac_sha256")).strip().lower()
    key_env = str(signature_cfg.get("key_env", "LAYERPEG_PROOF_HMAC_KEY")).strip()
    if not key_env:
        raise ProofBuildError("proof.signature.key_env is required")

    secret = os.getenv(key_env)
    if not secret:
        raise ProofBuildError(f"proof signature key is not configured in env: {key_env}")

    if algorithm != "hmac_sha256":
        raise ProofBuildError(f"unsupported signature algorithm: {algorithm}")

    digest = hmac.new(secret.encode("utf-8"), proof_hash.encode("utf-8"), hashlib.sha256).hexdigest()
    return digest, algorithm
