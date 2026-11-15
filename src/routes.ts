import { createHashRouter, createPanel, createRoot, createView, RoutesConfig } from '@vkontakte/vk-mini-apps-router';

export const DEFAULT_ROOT = 'default_root';
export const DEFAULT_VIEW = 'default_view';

export const DEFAULT_VIEW_PANELS = {
  HOME: 'home',
  GOALS: 'goals',
  GROUP: 'group',
  CATALOG: 'catalog',
  CREATE: 'create',
  GOAL: 'goal',
  JOIN: 'join',
  EDIT: 'edit',
} as const;

export const routes = RoutesConfig.create([
  createRoot(DEFAULT_ROOT, [
    createView(DEFAULT_VIEW, [
      createPanel(DEFAULT_VIEW_PANELS.HOME, '/', []),
      createPanel(DEFAULT_VIEW_PANELS.GOALS, '/goals', []),
      createPanel(DEFAULT_VIEW_PANELS.GROUP, '/group', []),
      createPanel(DEFAULT_VIEW_PANELS.CATALOG, '/catalog', []),
      createPanel(DEFAULT_VIEW_PANELS.CREATE, '/create', []),
      createPanel(DEFAULT_VIEW_PANELS.GOAL, '/goal/:id', []),
      createPanel(DEFAULT_VIEW_PANELS.JOIN, '/join', []),
      createPanel(DEFAULT_VIEW_PANELS.EDIT, '/edit/:id', []),
    ]),
  ]),
]);

export const router = createHashRouter(routes.getRoutes());
