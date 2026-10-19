#  Copyright 2025 Collate
#  Licensed under the Collate Community License, Version 1.0 (the "License");
#  you may not use this file except in compliance with the License.
#  You may obtain a copy of the License at
#  https://github.com/open-metadata/OpenMetadata/blob/main/ingestion/LICENSE
#  Unless required by applicable law or agreed to in writing, software
#  distributed under the License is distributed on an "AS IS" BASIS,
#  WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
#  See the License for the specific language governing permissions and
#  limitations under the License.
"""
testSuite DAG function builder
"""
import json
from functools import partial

from airflow import DAG
from openmetadata_managed_apis.utils.logger import set_operator_logger
from openmetadata_managed_apis.workflows.ingestion.common import (
    CustomPythonOperator,
    build_dag,
    build_source,
    execute_workflow,
    send_failed_status_callback,
)
from openmetadata_managed_apis.workflows.ingestion.nt_rules import trigger_nt_rules

from metadata.generated.schema.entity.services.ingestionPipelines.ingestionPipeline import (
    IngestionPipeline,
)
from metadata.generated.schema.metadataIngestion.workflow import (
    LogLevels,
    OpenMetadataWorkflowConfig,
    Processor,
    Sink,
    WorkflowConfig,
)
from metadata.ingestion.ometa.utils import model_str
from metadata.workflow.data_quality import TestSuiteWorkflow


def test_suite_workflow(
    workflow_config: OpenMetadataWorkflowConfig,
):
    """
    Task that creates and runs the test suite workflow.

    The workflow_config gets cooked form the incoming
    ingestionPipeline.

    This is the callable used to create the PythonOperator
    """

    set_operator_logger(workflow_config)

    config = json.loads(
        workflow_config.model_dump_json(exclude_defaults=False, mask_secrets=False)
    )
    workflow = TestSuiteWorkflow.create(config)
    execute_workflow(workflow, workflow_config)


def build_test_suite_workflow_config(
    ingestion_pipeline: IngestionPipeline,
) -> OpenMetadataWorkflowConfig:
    """
    Given an airflow_pipeline, prepare the workflow config JSON
    """

    workflow_config = OpenMetadataWorkflowConfig(
        source=build_source(ingestion_pipeline),
        sink=Sink(
            type="metadata-rest",
            config={},
        ),
        processor=Processor(
            type="orm-test-runner",
            config={},
        ),
        workflowConfig=WorkflowConfig(
            loggerLevel=ingestion_pipeline.loggerLevel or LogLevels.INFO,
            openMetadataServerConfig=ingestion_pipeline.openMetadataServerConnection,
        ),
        ingestionPipelineFQN=ingestion_pipeline.fullyQualifiedName.root,
        enableStreamableLogs=ingestion_pipeline.enableStreamableLogs,
    )

    return workflow_config


def build_test_suite_dag(ingestion_pipeline: IngestionPipeline) -> DAG:
    """Build a simple testSuite DAG"""
    workflow_config = build_test_suite_workflow_config(ingestion_pipeline)
    dag = build_dag(
        task_name="test_suite_task",
        ingestion_pipeline=ingestion_pipeline,
        workflow_config=workflow_config,
        workflow_fn=test_suite_workflow,
    )

    source_config = ingestion_pipeline.sourceConfig.config
    entity_fqn = getattr(source_config, "entityFullyQualifiedName", None)
    table_fqn = model_str(entity_fqn) if entity_fqn else None
    test_suite_fqn = (
        None if table_fqn else model_str(ingestion_pipeline.service.name)
    )
    configured_cases = getattr(source_config, "testCases", None)
    test_case_names = (
        [model_str(test_case) for test_case in configured_cases]
        if configured_cases is not None
        else None
    )

    with dag:
        nt_task = CustomPythonOperator(
            task_id="trigger_nt_rules",
            python_callable=trigger_nt_rules,
            op_kwargs={
                "workflow_config": workflow_config,
                "pipeline_id": model_str(ingestion_pipeline.id),
                "table_fqn": table_fqn,
                "test_suite_fqn": test_suite_fqn,
                "test_case_names": test_case_names,
            },
            retries=0,
            on_failure_callback=partial(
                send_failed_status_callback,
                workflow_config,
            ),
            owner=(
                ingestion_pipeline.owners.root[0].name
                if ingestion_pipeline.owners and ingestion_pipeline.owners.root
                else "openmetadata"
            ),
        )
        dag.get_task("test_suite_task") >> nt_task

    return dag
