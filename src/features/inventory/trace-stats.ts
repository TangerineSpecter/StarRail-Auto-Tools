export type TraceStatNode = {
  id: number;
};

/**
 * 部分角色页面会把同一套额外属性节点以“1 + 原节点 ID”再输出一次。
 * 监听器只有一组 stat_1…stat_10 开关，因此只保留 ID 最短的原始节点组。
 */
export function primaryTraceNodes<T extends TraceStatNode>(nodes: T[]): T[] {
  const primaryLength = Math.min(...nodes.map((node) => String(node.id).length));
  return nodes.filter((node) => String(node.id).length === primaryLength);
}
