import { ReactNode, useEffect, useState } from 'react';
import bridge, { UserInfo } from '@vkontakte/vk-bridge';
import {
  Cell, Group as VKGroup, Panel, ScreenSpinner, Snackbar, SplitCol, SplitLayout, Tabbar, TabbarItem, View,
  useAdaptivityWithJSMediaQueries,
} from '@vkontakte/vkui';
import { Icon28HomeOutline, Icon28ListOutline, Icon28Users3Outline } from '@vkontakte/icons';
import { useActiveVkuiLocation, useRouteNavigator } from '@vkontakte/vk-mini-apps-router';
import { Catalog, CreateGoal, GoalDetails, Goals, Group, Home, JoinGoal } from './panels';
import { DEFAULT_VIEW_PANELS } from './routes';
import { useGoals } from './hooks/useGoals';
import { GoalDraft, GoalTemplate } from './types';
import { clearGoalInvite, parseGoalInvite } from './utils/invite';
import { getApiUserId, isVkLaunch } from './api';

const NAV_ITEMS = [
  { panel: DEFAULT_VIEW_PANELS.HOME, path: '/', label: 'Сегодня', icon: <Icon28HomeOutline /> },
  { panel: DEFAULT_VIEW_PANELS.GOALS, path: '/goals', label: 'Мои цели', icon: <Icon28ListOutline /> },
  { panel: DEFAULT_VIEW_PANELS.GROUP, path: '/group', label: 'Группа', icon: <Icon28Users3Outline /> },
];

export const App = () => {
  const { panel: activePanel = DEFAULT_VIEW_PANELS.HOME } = useActiveVkuiLocation();
  const routeNavigator = useRouteNavigator();
  const { isDesktop } = useAdaptivityWithJSMediaQueries();
  const [fetchedUser, setUser] = useState<UserInfo | undefined>();
  // Inside VK, wait for the profile before talking to the API (outside VK there is nothing to wait for).
  const [profileReady, setProfileReady] = useState(() => !isVkLaunch());
  const { goals, createGoal, createShared, joinShared, deleteGoal, markGoal, addValue, serverError, sharedLoaded } = useGoals(fetchedUser, profileReady);
  const [popout, setPopout] = useState<ReactNode | null>(<ScreenSpinner />);
  const [selectedTemplate, setSelectedTemplate] = useState<GoalTemplate | undefined>();
  const [inviteGroupId, setInviteGroupId] = useState<string | null>(() => parseGoalInvite(window.location.search));
  const [notice, setNotice] = useState('');

  useEffect(() => {
    if (!isVkLaunch()) {
      setPopout(null);
      return;
    }

    const fetchData = async () => {
      try {
        const user = await bridge.send('VKWebAppGetUserInfo');
        setUser(user);
      } catch {
        setUser(undefined);
      } finally {
        setProfileReady(true);
        setPopout(null);
      }
    };
    void fetchData();
  }, []);

  useEffect(() => {
    if (inviteGroupId && activePanel !== DEFAULT_VIEW_PANELS.JOIN) {
      routeNavigator.replace('/join');
    }
  }, [activePanel, inviteGroupId, routeNavigator]);

  const openGoal = (id: string) => {
    if (activePanel !== DEFAULT_VIEW_PANELS.GOAL) routeNavigator.push(`/goal/${id}`);
  };

  const openCustomGoal = () => {
    setSelectedTemplate(undefined);
    routeNavigator.push('/create');
  };

  const selectTemplate = (template: GoalTemplate) => {
    setSelectedTemplate(template);
    routeNavigator.push('/create');
  };

  const addGoal = async (draft: GoalDraft, message: string) => {
    try {
      const goal = draft.privacy === 'group' ? await createShared(draft) : createGoal({ ...draft, groupId: undefined });
      setNotice(message);
      routeNavigator.push(`/goal/${goal.id}`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Не удалось создать цель');
    }
  };

  const submitGoal = (draft: GoalDraft) => addGoal(draft, 'Цель создана. Первый шаг можно отметить уже сегодня.');

  const acceptInvite = async (groupId: string) => {
    try {
      const goal = await joinShared(groupId);
      clearGoalInvite();
      setInviteGroupId(null);
      setNotice('Вы присоединились к цели. Прогресс участников теперь общий.');
      routeNavigator.push(`/goal/${goal.id}`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Не удалось присоединиться к цели');
    }
  };

  const dismissInvite = () => {
    clearGoalInvite();
    setInviteGroupId(null);
    void routeNavigator.replace('/');
  };

  const removeGoal = async (id: string) => {
    try {
      await deleteGoal(id);
      setNotice('Цель удалена');
      routeNavigator.push('/goals');
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Не удалось удалить цель');
    }
  };

  const mainPanels: string[] = [DEFAULT_VIEW_PANELS.HOME, DEFAULT_VIEW_PANELS.GOALS, DEFAULT_VIEW_PANELS.GROUP];
  // Desktop gets a sidebar (VK's standard desktop pattern); phones and narrow windows keep the bottom tabbar.
  const showTabbar = !isDesktop && mainPanels.includes(activePanel);
  // Nested screens highlight their parent section in the sidebar.
  const activeSection: string = {
    [DEFAULT_VIEW_PANELS.GOAL]: DEFAULT_VIEW_PANELS.GOALS,
    [DEFAULT_VIEW_PANELS.CREATE]: DEFAULT_VIEW_PANELS.GOALS,
    [DEFAULT_VIEW_PANELS.CATALOG]: DEFAULT_VIEW_PANELS.GOALS,
    [DEFAULT_VIEW_PANELS.JOIN]: DEFAULT_VIEW_PANELS.GROUP,
  }[activePanel] || activePanel;

  return (
    <SplitLayout center>
      <SplitCol
        width="100%"
        maxWidth={isDesktop ? 640 : 760}
        stretchedOnMobile
        autoSpaced={isDesktop}
        className={showTabbar ? 'app-with-tabbar' : ''}
      >
        <View activePanel={activePanel}>
          <Home id={DEFAULT_VIEW_PANELS.HOME} fetchedUser={fetchedUser} goals={goals} serverError={serverError} onOpenGoal={openGoal} onCreateGoal={openCustomGoal} onMark={markGoal} onAddValue={addValue} />
          <Goals id={DEFAULT_VIEW_PANELS.GOALS} goals={goals} onOpenGoal={openGoal} onCreateGoal={openCustomGoal} onMark={markGoal} onAddValue={addValue} />
          <Group id={DEFAULT_VIEW_PANELS.GROUP} goals={goals} fetchedUser={fetchedUser} onCreateGoal={openCustomGoal} serverError={serverError} onNotice={setNotice} />
          <Catalog id={DEFAULT_VIEW_PANELS.CATALOG} onSelect={selectTemplate} />
          <CreateGoal key={selectedTemplate?.id || 'custom'} id={DEFAULT_VIEW_PANELS.CREATE} template={selectedTemplate} onCreate={submitGoal} />
          <GoalDetails id={DEFAULT_VIEW_PANELS.GOAL} goals={goals} loading={!sharedLoaded} currentUserId={getApiUserId(fetchedUser)} onOpenGoal={openGoal} onMark={markGoal} onAddValue={addValue} onDelete={removeGoal} />
          <JoinGoal id={DEFAULT_VIEW_PANELS.JOIN} groupId={inviteGroupId} fetchedUser={fetchedUser} onAccept={acceptInvite} onDismiss={dismissInvite} />
        </View>
        {showTabbar && (
          <Tabbar>
            {NAV_ITEMS.map((item) => (
              <TabbarItem key={item.panel} selected={activePanel === item.panel} label={item.label} aria-label={item.label} onClick={() => routeNavigator.push(item.path)}>
                {item.icon}
              </TabbarItem>
            ))}
          </Tabbar>
        )}
        {notice && <Snackbar duration={3000} onClose={() => setNotice('')} onClosed={() => setNotice('')}>{notice}</Snackbar>}
      </SplitCol>
      {isDesktop && (
        <SplitCol fixed width={280} maxWidth={280} autoSpaced>
          <Panel className="sidebar">
            <VKGroup>
              {NAV_ITEMS.map((item) => (
                <Cell
                  key={item.panel}
                  before={item.icon}
                  className={`sidebar__item ${activeSection === item.panel ? 'sidebar__item--active' : ''}`}
                  aria-current={activeSection === item.panel ? 'page' : undefined}
                  onClick={() => routeNavigator.push(item.path)}
                >
                  {item.label}
                </Cell>
              ))}
            </VKGroup>
          </Panel>
        </SplitCol>
      )}
      {popout}
    </SplitLayout>
  );
};
