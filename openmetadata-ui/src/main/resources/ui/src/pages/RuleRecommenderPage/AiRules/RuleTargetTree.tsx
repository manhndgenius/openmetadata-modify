/*
 *  Copyright 2026 Collate.
 *  Licensed under the Apache License, Version 2.0 (the "License");
 */

import {
  AppstoreOutlined,
  DatabaseOutlined,
  FolderOpenOutlined,
  TableOutlined,
} from '@ant-design/icons';
import { Empty, Tree, Typography } from 'antd';
import type { DataNode } from 'antd/lib/tree';
import { useMemo } from 'react';
import Fqn from '../../../utils/Fqn';

const { Text } = Typography;

interface RuleTargetTreeProps {
  ruleCountByTable: Record<string, number>;
  selectedTableFqn: string;
  tableFqns: string[];
  title: string;
  onSelect: (tableFqn: string) => void;
}

const splitFqn = (tableFqn: string) => {
  try {
    return Fqn.split(tableFqn);
  } catch {
    return tableFqn.split('.');
  }
};

const RuleTargetTree = ({
  ruleCountByTable,
  selectedTableFqn,
  tableFqns,
  title,
  onSelect,
}: RuleTargetTreeProps) => {
  const treeData = useMemo<DataNode[]>(() => {
    const databases = new Map<string, Map<string, string[]>>();

    tableFqns.forEach((tableFqn) => {
      const parts = splitFqn(tableFqn);
      const schema = parts.at(-2) || 'default';
      const database = parts.at(-3) || 'database';
      const databaseSchemas = databases.get(database) ?? new Map();
      const schemaTables = databaseSchemas.get(schema) ?? [];
      schemaTables.push(tableFqn);
      databaseSchemas.set(schema, schemaTables);
      databases.set(database, databaseSchemas);
    });

    const totalRules = Object.values(ruleCountByTable).reduce(
      (total, count) => total + count,
      0
    );
    const nodes: DataNode[] = [
      {
        icon: <AppstoreOutlined />,
        key: 'all',
        title: (
          <span className="rule-target-tree-label">
            <span>All tables</span>
            <Text type="secondary">{totalRules}</Text>
          </span>
        ),
      },
    ];

    databases.forEach((schemas, database) => {
      nodes.push({
        children: Array.from(schemas.entries()).map(
          ([schema, schemaTableFqns]) => ({
            children: schemaTableFqns.sort().map((tableFqn) => {
              const table = splitFqn(tableFqn).at(-1) || tableFqn;

              return {
                icon: <TableOutlined />,
                isLeaf: true,
                key: `table:${tableFqn}`,
                title: (
                  <span className="rule-target-tree-label">
                    <span title={tableFqn}>{table}</span>
                    <Text type="secondary">
                      {ruleCountByTable[tableFqn] ?? 0}
                    </Text>
                  </span>
                ),
              };
            }),
            icon: <FolderOpenOutlined />,
            key: `schema:${database}.${schema}`,
            selectable: false,
            title: schema,
          })
        ),
        icon: <DatabaseOutlined />,
        key: `database:${database}`,
        selectable: false,
        title: database,
      });
    });

    return nodes;
  }, [ruleCountByTable, tableFqns]);

  return (
    <aside className="rule-target-tree">
      <div className="rule-target-tree-header">
        <Text strong>{title}</Text>
        <Text type="secondary">{tableFqns.length} tables</Text>
      </div>
      {tableFqns.length === 0 ? (
        <Empty
          description="No tables with saved rules"
          image={Empty.PRESENTED_IMAGE_SIMPLE}
        />
      ) : (
        <Tree
          blockNode
          defaultExpandAll
          showIcon
          selectedKeys={[
            selectedTableFqn === 'ALL' ? 'all' : `table:${selectedTableFqn}`,
          ]}
          treeData={treeData}
          onSelect={(keys) => {
            const key = String(keys[0] ?? '');
            if (key === 'all') {
              onSelect('ALL');
            } else if (key.startsWith('table:')) {
              onSelect(key.slice('table:'.length));
            }
          }}
        />
      )}
    </aside>
  );
};

export default RuleTargetTree;
