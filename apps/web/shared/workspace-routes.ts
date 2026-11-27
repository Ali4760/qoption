import type { ClientState } from './client-ui';

type ClientTab = ClientState['activeTab'];

export const clientPaths = {
  market: '/trade',
  assets: '/trade/assets',
  wallet: '/assets',
  history: '/transactions',
  tradeHistory: '/history',
  leaderboard: '/leaderboard',
  profile: '/settings',
} satisfies Record<ClientTab, string>;

const tabsByPath = new Map(Object.entries(clientPaths).map(([tab, path]) => [path, tab as ClientTab]));
const legacyClientTabs = new Map<string, ClientTab>([
  ['trade', 'market'], ['market', 'market'], ['assets', 'assets'], ['wallet', 'wallet'],
  ['transactions', 'history'], ['history', 'tradeHistory'], ['leaderboard', 'leaderboard'],
  ['settings', 'profile'], ['profile', 'profile'],
]);

export function clientTabForPath(path: string): ClientTab {
  return tabsByPath.get(path.replace(/\/$/, '')) ?? 'market';
}

export function adminPath(route: string) {
  return '/advin/' + (route === 'overview' ? 'dashboard' : route);
}

export function adminClientPath(uid: string, messages = false) {
  return adminPath('clients') + '/' + encodeURIComponent(uid) + (messages ? '/messages' : '');
}

function decodeClientId(segment: string) {
  try {
    const uid = decodeURIComponent(segment);
    return uid === '.' || uid === '..' || uid.includes('/') ? '' : uid;
  } catch {
    return '';
  }
}

export function adminRouteForPath(path: string) {
  const detail = /^\/advin\/clients\/([^/]+)(\/messages)?\/?$/.exec(path);
  const uid = detail ? decodeClientId(detail[1]) : '';
  if (uid) return { route: 'client', uid, messages: Boolean(detail?.[2]) };

  const section = /^\/advin\/([^/]+)\/?$/.exec(path)?.[1];
  return { route: !section || section === 'dashboard' ? 'overview' : section, uid: '', messages: false };
}

export function workspaceEntryPath(
  { pathname, hash }: Pick<Location, 'pathname' | 'hash'>,
  adminRoutes?: readonly (readonly string[])[],
) {
  const path = pathname.replace(/\/$/, '').replace(/^\/(advin|login)\.html$/, '/$1');
  const [section, client, sub] = hash.slice(1).split('/');
  if (adminRoutes && path === '/advin') {
    if (section === 'client' && client) {
      const uid = decodeClientId(client);
      if (uid) return adminClientPath(uid, sub === 'messages');
    }
    if (adminRoutes.some(([id]) => id === section)) return adminPath(section);
  }
  if (!adminRoutes && path === '/login' && section) {
    return clientPaths[legacyClientTabs.get(section) ?? 'market'];
  }
  return path;
}
