"""Airflow bridge from an OpenMetadata Test Suite DAG to the NT backend."""

import os
import time
from datetime import datetime
from typing import Iterable, Optional

import requests

from metadata.generated.schema.entity.services.ingestionPipelines.ingestionPipeline import (
    PipelineState,
)
from metadata.generated.schema.metadataIngestion.workflow import OpenMetadataWorkflowConfig
from metadata.generated.schema.type.basic import Timestamp
from metadata.ingestion.ometa.ometa_api import OpenMetadata
from metadata.ingestion.ometa.utils import model_str

TERMINAL_SUCCESS = {"SUCCESS"}
TERMINAL_FAILURE = {"PARTIAL", "FAILED"}
ACTIVE_STATUSES = {"PENDING", "RUNNING"}


class NTRulesExecutionError(RuntimeError):
    """Raised when the NT backend cannot complete and publish all results."""


def _runs_url() -> str:
    base_url = os.getenv("DQ_NT_BACKEND_URL", "").rstrip("/")
    if not base_url:
        raise NTRulesExecutionError("DQ_NT_BACKEND_URL is not configured")
    if base_url.endswith("/api/v1"):
        return f"{base_url}/nt-runs"
    return f"{base_url}/api/v1/nt-runs"


def _headers() -> dict:
    headers = {"Accept": "application/json", "Content-Type": "application/json"}
    token = os.getenv("DQ_NT_BACKEND_TOKEN", "").strip()
    if token:
        headers["Authorization"] = f"Bearer {token}"
    return headers


def _set_pipeline_state(
    workflow_config: OpenMetadataWorkflowConfig,
    state: PipelineState,
    finished: bool,
) -> Optional[PipelineState]:
    """Update the same PipelineStatus record used by the built-in task."""
    pipeline_fqn = workflow_config.ingestionPipelineFQN
    run_id = workflow_config.pipelineRunId
    if not pipeline_fqn or not run_id:
        return None

    metadata = OpenMetadata(
        config=workflow_config.workflowConfig.openMetadataServerConfig
    )
    pipeline_fqn_value = model_str(pipeline_fqn)
    run_id_value = model_str(run_id)
    pipeline_status = metadata.get_pipeline_status(
        pipeline_fqn_value,
        run_id_value,
    )
    if not pipeline_status:
        raise NTRulesExecutionError(
            f"Pipeline status {pipeline_fqn_value}/{run_id_value} was not found"
        )

    previous_state = pipeline_status.pipelineState
    pipeline_status.pipelineState = state
    pipeline_status.endDate = (
        Timestamp(int(datetime.now().timestamp() * 1000)) if finished else None
    )
    metadata.create_or_update_pipeline_status(pipeline_fqn_value, pipeline_status)
    return previous_state


def trigger_nt_rules(
    workflow_config: OpenMetadataWorkflowConfig,
    pipeline_id: str,
    table_fqn: Optional[str] = None,
    test_suite_fqn: Optional[str] = None,
    test_case_names: Optional[Iterable[str]] = None,
) -> None:
    """Create an NT run, wait for publishing, then finalize pipeline status."""
    previous_state = _set_pipeline_state(
        workflow_config,
        PipelineState.running,
        finished=False,
    )
    try:
        payload = {"pipeline_id": pipeline_id}
        if table_fqn:
            payload["table_fqn"] = table_fqn
        else:
            payload["test_suite_fqn"] = test_suite_fqn
        if test_case_names is not None:
            payload["test_case_names"] = list(test_case_names)

        request_timeout = float(os.getenv("DQ_NT_REQUEST_TIMEOUT_SECONDS", "30"))
        poll_interval = float(os.getenv("DQ_NT_POLL_INTERVAL_SECONDS", "2"))
        execution_timeout = float(os.getenv("DQ_NT_TIMEOUT_SECONDS", "3600"))
        headers = _headers()
        runs_url = _runs_url()

        response = requests.post(
            runs_url,
            json=payload,
            headers=headers,
            timeout=request_timeout,
        )
        if response.status_code not in (200, 201, 202):
            raise NTRulesExecutionError(
                f"NT run creation returned HTTP {response.status_code}: {response.text}"
            )
        summary = response.json()
        run_id = summary.get("run_id")
        if not run_id:
            raise NTRulesExecutionError("NT run creation response has no run_id")

        deadline = time.monotonic() + execution_timeout
        while summary.get("status") in ACTIVE_STATUSES:
            if time.monotonic() >= deadline:
                raise NTRulesExecutionError(
                    f"NT run {run_id} did not finish within {execution_timeout}s"
                )
            time.sleep(poll_interval)
            response = requests.get(
                f"{runs_url}/{run_id}",
                headers=headers,
                timeout=request_timeout,
            )
            if response.status_code != 200:
                raise NTRulesExecutionError(
                    f"NT run status returned HTTP {response.status_code}: {response.text}"
                )
            summary = response.json()

        status = summary.get("status")
        if status in TERMINAL_FAILURE:
            raise NTRulesExecutionError(
                f"NT run {run_id} ended with {status}: "
                f"errors={summary.get('error_items', 0)}, "
                f"skipped={summary.get('skipped_items', 0)}"
            )
        if status not in TERMINAL_SUCCESS:
            raise NTRulesExecutionError(
                f"NT run {run_id} returned unknown status: {status}"
            )

        final_state = (
            PipelineState.partialSuccess
            if previous_state == PipelineState.partialSuccess
            else PipelineState.success
        )
        _set_pipeline_state(workflow_config, final_state, finished=True)
    except Exception:
        _set_pipeline_state(workflow_config, PipelineState.failed, finished=True)
        raise
