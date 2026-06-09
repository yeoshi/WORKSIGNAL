import { describe, it, expect } from 'vitest';
import {
  areAllNetworkCompaniesComplete,
  connectionReachOutKey,
  formatReachOutStatus,
  getActiveNetworkItems,
  getNetworkCardSubtext,
  isCompanyFullyReachedOut,
  loadArchivedCompanies,
  loadReachedOutChannels,
  loadReachedOutConnections,
  loadReachedOutDates,
  saveArchivedCompanies,
  saveReachedOutChannels,
  saveReachedOutConnections,
  saveReachedOutDates,
} from './networkStorage';

describe('networkStorage', () => {
  it('builds stable reach-out keys', () => {
    expect(connectionReachOutKey('Grab', 'Li Wei')).toBe('Grab::Li Wei');
  });

  it('persists reached-out connections', () => {
    saveReachedOutConnections(new Set(['Grab::Li Wei']));
    expect(loadReachedOutConnections()).toEqual(new Set(['Grab::Li Wei']));
  });

  it('persists empty set when all connections are undone', () => {
    saveReachedOutConnections(new Set(['Grab::Li Wei']));
    saveReachedOutConnections(new Set());
    expect(loadReachedOutConnections()).toEqual(new Set());
  });

  it('persists reached-out dates', () => {
    saveReachedOutDates({ 'Grab::Li Wei': '2026-06-09T00:00:00.000Z' });
    expect(loadReachedOutDates()).toEqual({
      'Grab::Li Wei': '2026-06-09T00:00:00.000Z',
    });
  });

  it('persists reached-out channels', () => {
    saveReachedOutChannels({ 'Grab::Li Wei': 'linkedin' });
    expect(loadReachedOutChannels()).toEqual({ 'Grab::Li Wei': 'linkedin' });
  });

  it('formats reach-out status by channel', () => {
    expect(
      formatReachOutStatus('2026-06-09T00:00:00.000Z', 'linkedin'),
    ).toContain('LinkedIn');
    expect(
      formatReachOutStatus('2026-06-09T00:00:00.000Z', 'email'),
    ).toContain('email');
  });

  it('persists archived companies', () => {
    saveArchivedCompanies(new Set(['Grab']));
    expect(loadArchivedCompanies()).toEqual(new Set(['Grab']));
  });

  it('detects when a company is fully reached out', () => {
    const reachedOut = new Set(['Grab::A', 'Grab::B']);
    expect(isCompanyFullyReachedOut('Grab', 2, reachedOut)).toBe(true);
    expect(isCompanyFullyReachedOut('Grab', 3, reachedOut)).toBe(false);
  });

  it('shows only in-progress companies in card subtext', () => {
    saveReachedOutConnections(
      new Set(['Grab::A', 'Grab::B', 'Grab::C']),
    );

    const subtext = getNetworkCardSubtext([
      { company: 'Grab', application_count: 2, suggestion_count: 3 },
      { company: 'GovTech', application_count: 2, suggestion_count: 2 },
    ]);

    expect(subtext).toBe('1 company · 2 connections');
  });

  it('returns no active companies when all are reached out', () => {
    saveReachedOutConnections(
      new Set([
        'Grab::A',
        'Grab::B',
        'Grab::C',
        'GovTech::D',
        'GovTech::E',
      ]),
    );

    const items = [
      { company: 'Grab', application_count: 2, suggestion_count: 3 },
      { company: 'GovTech', application_count: 2, suggestion_count: 2 },
    ];

    expect(getActiveNetworkItems(items)).toEqual([]);
    expect(areAllNetworkCompaniesComplete(items)).toBe(true);
    expect(getNetworkCardSubtext(items)).toBe('All connections reached out');
  });
});
