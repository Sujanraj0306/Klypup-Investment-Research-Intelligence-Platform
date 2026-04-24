export const COMPARE_COLORS = ['#3B82F6', '#10B981', '#F59E0B', '#EF4444'];

export function colorForIdx(i: number): string {
  return COMPARE_COLORS[i % COMPARE_COLORS.length];
}
