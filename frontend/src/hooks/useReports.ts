import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import type {
  CreateReportInput,
  Report,
  ReportsListResponse,
  UpdateReportInput,
} from '../types';

export interface ReportFilters {
  search?: string;
  tags?: string[];
  limit?: number;
  offset?: number;
}

function buildQuery(filters: ReportFilters): string {
  const params = new URLSearchParams();
  if (filters.search) params.set('search', filters.search);
  if (filters.tags && filters.tags.length) params.set('tags', filters.tags.join(','));
  if (typeof filters.limit === 'number') params.set('limit', String(filters.limit));
  if (typeof filters.offset === 'number') params.set('offset', String(filters.offset));
  return params.toString();
}

export function useReports(filters: ReportFilters = {}) {
  const qs = buildQuery(filters);
  return useQuery<ReportsListResponse>({
    queryKey: ['reports', filters],
    queryFn: () => api.get<ReportsListResponse>(`/api/reports${qs ? `?${qs}` : ''}`),
    staleTime: 60 * 1000,
  });
}

export function useReport(reportId: string | undefined) {
  return useQuery<Report>({
    queryKey: ['report', reportId],
    queryFn: () => api.get<Report>(`/api/reports/${reportId}`),
    enabled: Boolean(reportId),
  });
}

export function useSaveReport() {
  const qc = useQueryClient();
  return useMutation<Report, Error, CreateReportInput>({
    mutationFn: (payload) => api.post<Report>('/api/reports', payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['reports'] });
    },
  });
}

export function useUpdateReport(reportId: string) {
  const qc = useQueryClient();
  return useMutation<Report, Error, UpdateReportInput>({
    mutationFn: (payload) => api.patch<Report>(`/api/reports/${reportId}`, payload),
    onSuccess: (report) => {
      qc.invalidateQueries({ queryKey: ['reports'] });
      qc.setQueryData(['report', reportId], report);
    },
  });
}

export function useDeleteReport() {
  const qc = useQueryClient();
  return useMutation<void, Error, string>({
    mutationFn: (reportId) => api.delete<void>(`/api/reports/${reportId}`),
    onSuccess: (_data, reportId) => {
      qc.invalidateQueries({ queryKey: ['reports'] });
      qc.removeQueries({ queryKey: ['report', reportId] });
    },
  });
}
