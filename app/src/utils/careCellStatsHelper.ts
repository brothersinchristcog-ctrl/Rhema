import type {
  CareCell,
  CareCellMeeting,
  CareCellMembership,
  CareCellOverviewStats,
} from '../types/CareCellTypes';

export interface CareCellOverviewDataset {
  cells: CareCell[];
  memberships: CareCellMembership[];
  meetings: CareCellMeeting[];
  attendance: Array<{ cellId?: string; meetingId?: string; attendanceStatus?: string }>;
  pendingFollowupsCount: number;
}

export interface CareCellOverviewFilters {
  month?: number;
  year?: number;
  cellId?: string;
  status?: string;
}

/**
 * Pure synchronous KPI aggregator for the Care Cells Overview tab.
 * Lets month, year, and cell filter changes recompute instantaneously in memory without re-querying Firestore.
 */
export function computeCareCellOverviewStats(
  dataset: CareCellOverviewDataset,
  filters?: CareCellOverviewFilters,
  scopedCellsOverride?: CareCell[]
): CareCellOverviewStats {
  const cellsSource =
    Array.isArray(scopedCellsOverride) && scopedCellsOverride.length > 0
      ? scopedCellsOverride
      : dataset.cells;

  const totalCareCells = cellsSource.length;
  const activeCareCells = cellsSource.filter((c) => c.status === 'Active').length;
  const inactiveCareCells = cellsSource.filter((c) => c.status === 'Inactive').length;

  const leaderIds = new Set<string>();
  cellsSource.forEach((c) => {
    if (c.leaderId) leaderIds.add(c.leaderId);
    if (c.assistantLeaderId) leaderIds.add(c.assistantLeaderId);
  });
  const totalCellLeaders = leaderIds.size;

  const filterCellId = filters?.cellId && filters.cellId !== 'ALL' ? filters.cellId : null;
  const allowedCellIds =
    Array.isArray(scopedCellsOverride) && scopedCellsOverride.length > 0
      ? new Set(scopedCellsOverride.map((c) => c.id))
      : null;

  const filteredMemberships = dataset.memberships.filter((m) => {
    if (allowedCellIds && !allowedCellIds.has(m.cellId)) return false;
    if (filterCellId && m.cellId !== filterCellId) return false;
    return true;
  });

  const now = new Date();
  const currentYear = filters?.year || now.getFullYear();
  const currentMonth = filters?.month || now.getMonth() + 1;

  const meetingsThisMonth = dataset.meetings.filter((m) => {
    if (allowedCellIds && !allowedCellIds.has(m.cellId)) return false;
    if (filterCellId && m.cellId !== filterCellId) return false;
    const parts = (m.date || '').split('-');
    if (parts.length < 2) return false;
    const y = parseInt(parts[0], 10);
    const mo = parseInt(parts[1], 10);
    return y === currentYear && mo === currentMonth;
  });

  const filteredAttendance = dataset.attendance.filter((a) => {
    if (allowedCellIds && a.cellId && !allowedCellIds.has(a.cellId)) return false;
    if (filterCellId && a.cellId !== filterCellId) return false;
    return true;
  });

  let attendanceRate = 0;
  if (filteredAttendance.length > 0) {
    const presentOrLate = filteredAttendance.filter(
      (a) => a.attendanceStatus === 'Present' || a.attendanceStatus === 'Late'
    ).length;
    attendanceRate = Math.round((presentOrLate / filteredAttendance.length) * 100);
  }

  return {
    totalCareCells,
    activeCareCells,
    inactiveCareCells,
    totalCellLeaders,
    totalAssignedMembers: filteredMemberships.length,
    totalMeetingsThisMonth: meetingsThisMonth.length,
    averageAttendanceRate: attendanceRate,
    membersRequiringFollowup: dataset.pendingFollowupsCount,
  };
}
