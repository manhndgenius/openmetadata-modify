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
Validate metadata ingestion workflow generation
"""
import json
import uuid
from datetime import datetime
from types import SimpleNamespace
from unittest import TestCase
from unittest.mock import call, patch

from openmetadata_managed_apis.workflows.ingestion.lineage import (
    build_lineage_workflow_config,
)
from openmetadata_managed_apis.workflows.ingestion.metadata import (
    build_metadata_workflow_config,
)
from openmetadata_managed_apis.workflows.ingestion.profiler import (
    build_profiler_workflow_config,
)
from openmetadata_managed_apis.workflows.ingestion.test_suite import (
    build_test_suite_dag,
    build_test_suite_workflow_config,
)
from openmetadata_managed_apis.workflows.ingestion.nt_rules import (
    NTRulesExecutionError,
    trigger_nt_rules,
)
from openmetadata_managed_apis.workflows.ingestion.usage import (
    build_usage_workflow_config,
)

from metadata.generated.schema.entity.services.connections.metadata.openMetadataConnection import (
    OpenMetadataConnection,
)
from metadata.generated.schema.entity.services.databaseService import DatabaseService
from metadata.generated.schema.entity.services.ingestionPipelines.ingestionPipeline import (
    AirflowConfig,
    IngestionPipeline,
    PipelineState,
    PipelineType,
)
from metadata.generated.schema.metadataIngestion.databaseServiceMetadataPipeline import (
    DatabaseServiceMetadataPipeline,
)
from metadata.generated.schema.metadataIngestion.databaseServiceProfilerPipeline import (
    DatabaseServiceProfilerPipeline,
)
from metadata.generated.schema.metadataIngestion.databaseServiceQueryLineagePipeline import (
    DatabaseServiceQueryLineagePipeline,
)
from metadata.generated.schema.metadataIngestion.databaseServiceQueryUsagePipeline import (
    DatabaseServiceQueryUsagePipeline,
)
from metadata.generated.schema.metadataIngestion.testSuitePipeline import (
    TestSuitePipeline,
)
from metadata.generated.schema.metadataIngestion.workflow import (
    Source as WorkflowSource,
)
from metadata.generated.schema.metadataIngestion.workflow import SourceConfig
from metadata.generated.schema.security.client.openMetadataJWTClientConfig import (
    OpenMetadataJWTClientConfig,
)
from metadata.generated.schema.type.basic import DateTime
from metadata.generated.schema.type.entityReference import EntityReference
from metadata.ingestion.api.parser import parse_workflow_config_gracefully
from metadata.ingestion.ometa.ometa_api import OpenMetadata
from metadata.workflow.data_quality import TestSuiteWorkflow
from metadata.workflow.metadata import MetadataWorkflow
from metadata.workflow.profiler import ProfilerWorkflow


def mock_set_ingestion_pipeline_status(self, state):
    return True


START_DATE = DateTime(datetime.strptime("2022-06-10T15:06:47", "%Y-%m-%dT%H:%M:%S"))


class OMetaServiceTest(TestCase):
    """
    Run this integration test with the local API available
    Install the ingestion package before running the tests
    """

    service_entity_id = None

    server_config = OpenMetadataConnection(
        hostPort="http://localhost:8585/api",
        authProvider="openmetadata",
        securityConfig=OpenMetadataJWTClientConfig(
            jwtToken="eyJraWQiOiJHYjM4OWEtOWY3Ni1nZGpzLWE5MmotMDI0MmJrOTQzNTYiLCJ0eXAiOiJKV1QiLCJhbGciOiJSUzI1NiJ9.eyJzdWIiOiJhZG1pbiIsImlzQm90IjpmYWxzZSwiaXNzIjoib3Blbi1tZXRhZGF0YS5vcmciLCJpYXQiOjE2NjM5Mzg0NjIsImVtYWlsIjoiYWRtaW5Ab3Blbm1ldGFkYXRhLm9yZyJ9.tS8um_5DKu7HgzGBzS1VTA5uUjKWOCU0B_j08WXBiEC0mr0zNREkqVfwFDD-d24HlNEbrqioLsBuFRiwIWKc1m_ZlVQbG7P36RUxhuv2vbSp80FKyNM-Tj93FDzq91jsyNmsQhyNv_fNr3TXfzzSPjHt8Go0FMMP66weoKMgW2PbXlhVKwEuXUHyakLLzewm9UMeQaEiRzhiTMU3UkLXcKbYEJJvfNFcLwSl9W8JCO_l0Yj3ud-qt_nQYEZwqW6u5nfdQllN133iikV4fM5QZsMCnm8Rq1mvLR0y9bmJiD7fwM1tmJ791TUWqmKaTnP49U493VanKpUAfzIiOiIbhg"
        ),
    )
    metadata = OpenMetadata(server_config)

    assert metadata.health_check()

    data = {
        "type": "mysql",
        "serviceName": "test-workflow-mysql",
        "serviceConnection": {
            "config": {
                "type": "Mysql",
                "username": "openmetadata_user",
                "authType": {"password": "openmetadata_password"},
                "hostPort": "localhost:3306",
            }
        },
        "sourceConfig": {"config": {"type": "DatabaseMetadata"}},
    }

    usage_data = {
        "type": "snowflake",
        "serviceName": "local_snowflake",
        "serviceConnection": {
            "config": {
                "type": "Snowflake",
                "username": "openmetadata_user",
                "password": "random",
                "warehouse": "warehouse",
                "account": "account",
            }
        },
        "sourceConfig": {"config": {"type": "DatabaseUsage", "queryLogDuration": 10}},
    }

    lineage_data = {
        "type": "snowflake",
        "serviceName": "local_snowflake",
        "serviceConnection": {
            "config": {
                "type": "Snowflake",
                "username": "openmetadata_user",
                "password": "random",
                "warehouse": "warehouse",
                "account": "account",
            }
        },
        "sourceConfig": {"config": {"type": "DatabaseLineage", "queryLogDuration": 10}},
    }

    workflow_source = WorkflowSource(**data)
    usage_workflow_source = WorkflowSource(**usage_data)

    @classmethod
    def setUpClass(cls) -> None:
        """
        Prepare ingredients.

        Mock a db service to build the IngestionPipeline
        """
        cls.service: DatabaseService = cls.metadata.get_service_or_create(
            entity=DatabaseService, config=cls.workflow_source
        )

        cls.usage_service: DatabaseService = cls.metadata.get_service_or_create(
            entity=DatabaseService,
            config=cls.usage_workflow_source,
        )

    @classmethod
    def tearDownClass(cls) -> None:
        """
        Clean up
        """
        cls.metadata.delete(
            entity=DatabaseService,
            entity_id=cls.service.id,
            recursive=True,
            hard_delete=True,
        )

    @patch.object(
        MetadataWorkflow,
        "set_ingestion_pipeline_status",
        mock_set_ingestion_pipeline_status,
    )
    def test_ingestion_workflow(self):
        """
        Validate that the ingestionPipeline can be parsed
        and properly load a Workflow
        """

        ingestion_pipeline = IngestionPipeline(
            id=uuid.uuid4(),
            name="test_ingestion_workflow",
            pipelineType=PipelineType.metadata,
            fullyQualifiedName="local_mysql.test_ingestion_workflow",
            sourceConfig=SourceConfig(config=DatabaseServiceMetadataPipeline()),
            openMetadataServerConnection=self.server_config,
            airflowConfig=AirflowConfig(
                startDate=START_DATE,
            ),
            service=EntityReference(
                id=self.service.id,
                type="databaseService",
                name=self.service.name.root,
            ),
        )

        workflow_config = build_metadata_workflow_config(ingestion_pipeline)
        config = json.loads(workflow_config.model_dump_json())

        parse_workflow_config_gracefully(config)

    @patch.object(
        MetadataWorkflow,
        "set_ingestion_pipeline_status",
        mock_set_ingestion_pipeline_status,
    )
    def test_usage_workflow(self):
        """
        Validate that the ingestionPipeline can be parsed
        and properly load a usage Workflow
        """

        ingestion_pipeline = IngestionPipeline(
            id=uuid.uuid4(),
            name="test_usage_workflow",
            pipelineType=PipelineType.usage,
            fullyQualifiedName="local_snowflake.test_usage_workflow",
            sourceConfig=SourceConfig(config=DatabaseServiceQueryUsagePipeline()),
            openMetadataServerConnection=self.server_config,
            airflowConfig=AirflowConfig(
                startDate=START_DATE,
            ),
            service=EntityReference(
                id=self.usage_service.id,
                type="databaseService",
                name=self.usage_service.name.root,
            ),
        )

        workflow_config = build_usage_workflow_config(ingestion_pipeline)
        self.assertIn("usage", workflow_config.source.type)

        config = json.loads(workflow_config.model_dump_json())

        parse_workflow_config_gracefully(config)

    @patch.object(
        MetadataWorkflow,
        "set_ingestion_pipeline_status",
        mock_set_ingestion_pipeline_status,
    )
    def test_lineage_workflow(self):
        """
        Validate that the ingestionPipeline can be parsed
        and properly load a lineage Workflow
        """

        ingestion_pipeline = IngestionPipeline(
            id=uuid.uuid4(),
            name="test_lineage_workflow",
            pipelineType=PipelineType.lineage,
            fullyQualifiedName="local_snowflake.test_lineage_workflow",
            sourceConfig=SourceConfig(config=DatabaseServiceQueryLineagePipeline()),
            openMetadataServerConnection=self.server_config,
            airflowConfig=AirflowConfig(
                startDate=START_DATE,
            ),
            service=EntityReference(
                id=self.usage_service.id,
                type="databaseService",
                name=self.usage_service.name.root,
            ),
        )

        workflow_config = build_lineage_workflow_config(ingestion_pipeline)
        self.assertIn("lineage", workflow_config.source.type)

        config = json.loads(workflow_config.model_dump_json())

        parse_workflow_config_gracefully(config)

    @patch.object(
        ProfilerWorkflow,
        "set_ingestion_pipeline_status",
        mock_set_ingestion_pipeline_status,
    )
    def test_profiler_workflow(self):
        """
        Validate that the ingestionPipeline can be parsed
        and properly load a Profiler Workflow
        """

        ingestion_pipeline = IngestionPipeline(
            id=uuid.uuid4(),
            name="test_profiler_workflow",
            pipelineType=PipelineType.profiler,
            fullyQualifiedName="local_mysql.test_profiler_workflow",
            sourceConfig=SourceConfig(config=DatabaseServiceProfilerPipeline()),
            openMetadataServerConnection=self.server_config,
            airflowConfig=AirflowConfig(
                startDate=START_DATE,
            ),
            service=EntityReference(
                id=self.service.id,
                type="databaseService",
                name=self.service.name.root,
            ),
        )

        workflow_config = build_profiler_workflow_config(ingestion_pipeline)
        config = json.loads(workflow_config.model_dump_json())

        parse_workflow_config_gracefully(config)

    @patch.object(
        TestSuiteWorkflow,
        "set_ingestion_pipeline_status",
        mock_set_ingestion_pipeline_status,
    )
    def test_test_suite_workflow(self):
        """
        Validate that the ingestionPipeline can be parsed
        and properly load a Test Suite Workflow
        """

        ingestion_pipeline = IngestionPipeline(
            id=uuid.uuid4(),
            name="test_test_suite_workflow",
            pipelineType=PipelineType.TestSuite,
            fullyQualifiedName="local_mysql.test_test_suite_workflow",
            sourceConfig=SourceConfig(
                config=TestSuitePipeline(
                    type="TestSuite",
                    entityFullyQualifiedName=self.service.name.root,
                )
            ),
            openMetadataServerConnection=self.server_config,
            airflowConfig=AirflowConfig(
                startDate=START_DATE,
            ),
            service=EntityReference(
                id=uuid.uuid4(),
                type="testSuite",
                name="test_test_suite_workflow",
            ),
        )

        workflow_config = build_test_suite_workflow_config(ingestion_pipeline)
        config = json.loads(workflow_config.model_dump_json())

        parse_workflow_config_gracefully(config)

        source = WorkflowSource(
            type="testSuite",
            serviceName=ingestion_pipeline.service.name,
            sourceConfig=ingestion_pipeline.sourceConfig,
            serviceConnection=None,
        )
        with patch(
            "openmetadata_managed_apis.workflows.ingestion.test_suite.build_source",
            return_value=source,
        ):
            dag = build_test_suite_dag(ingestion_pipeline)

        assert set(dag.task_ids) == {"test_suite_task", "trigger_nt_rules"}
        assert dag.get_task("test_suite_task").downstream_task_ids == {
            "trigger_nt_rules"
        }
        nt_task = dag.get_task("trigger_nt_rules")
        assert nt_task.retries == 0
        assert nt_task.op_kwargs["table_fqn"] == self.service.name.root


class NTRulesTaskTest(TestCase):
    class Response:
        def __init__(self, payload, status_code=200):
            self.payload = payload
            self.status_code = status_code
            self.text = str(payload)

        def json(self):
            return self.payload

    @patch.dict(
        "os.environ",
        {
            "DQ_NT_BACKEND_URL": "http://dq-backend:8000",
            "DQ_NT_POLL_INTERVAL_SECONDS": "0",
            "DQ_NT_TIMEOUT_SECONDS": "10",
        },
        clear=False,
    )
    @patch("openmetadata_managed_apis.workflows.ingestion.nt_rules.time.sleep")
    @patch("openmetadata_managed_apis.workflows.ingestion.nt_rules.requests.get")
    @patch("openmetadata_managed_apis.workflows.ingestion.nt_rules.requests.post")
    @patch(
        "openmetadata_managed_apis.workflows.ingestion.nt_rules._set_pipeline_state"
    )
    def test_waits_until_nt_results_are_published(
        self, set_state, post, get, _sleep
    ):
        workflow_config = SimpleNamespace()
        set_state.side_effect = [PipelineState.success, PipelineState.running]
        post.return_value = self.Response(
            {"run_id": "run-1", "status": "PENDING"}, 202
        )
        get.side_effect = [
            self.Response({"run_id": "run-1", "status": "RUNNING"}),
            self.Response(
                {
                    "run_id": "run-1",
                    "status": "SUCCESS",
                    "outcome_counts": {"FAIL": 2, "WARNING": 1},
                }
            ),
        ]

        trigger_nt_rules(
            workflow_config,
            pipeline_id="pipeline-id",
            table_fqn="service.db.schema.table",
        )

        self.assertEqual(get.call_count, 2)
        self.assertEqual(
            set_state.call_args_list,
            [
                call(workflow_config, PipelineState.running, finished=False),
                call(workflow_config, PipelineState.success, finished=True),
            ],
        )

    @patch.dict(
        "os.environ",
        {"DQ_NT_BACKEND_URL": "http://dq-backend:8000"},
        clear=False,
    )
    @patch("openmetadata_managed_apis.workflows.ingestion.nt_rules.requests.post")
    @patch(
        "openmetadata_managed_apis.workflows.ingestion.nt_rules._set_pipeline_state"
    )
    def test_technical_failure_fails_the_airflow_task(self, set_state, post):
        workflow_config = SimpleNamespace()
        set_state.side_effect = [PipelineState.success, PipelineState.failed]
        post.return_value = self.Response(
            {
                "run_id": "run-2",
                "status": "PARTIAL",
                "error_items": 1,
                "skipped_items": 0,
            },
            202,
        )

        with self.assertRaisesRegex(NTRulesExecutionError, "ended with PARTIAL"):
            trigger_nt_rules(
                workflow_config,
                pipeline_id="pipeline-id",
                test_suite_fqn="logical-suite",
                test_case_names=["case-a"],
            )

        self.assertEqual(
            set_state.call_args_list[-1],
            call(workflow_config, PipelineState.failed, finished=True),
        )
