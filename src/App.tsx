import { ReactNode, useEffect, useState } from 'react';
import bridge, { UserInfo } from '@vkontakte/vk-bridge';
import { ScreenSpinner, Snackbar, SplitCol, SplitLayout, Tabbar, TabbarItem, View } from '@vkontakte/vkui';
import { Icon28HomeOutline, Icon28ListOutline, Icon28Users3Outline } from '@vkontakte/icons';
import { useActiveVkuiLocation, useRouteNavigator } from '@vkontakte/vk-mini-apps-router';
import { Catalog, CreateGoal, GoalDetails, Goals, Group, Home, JoinGoal } from './panels';
import { DEFAULT_VIEW_PANELS } from './routes';
import { useGoals } from './hooks/useGoals';
import { GoalDraft, GoalTemplate } from './types';
import { clearGoalInvite, parseGoalInvite } from './utils/invite';
import { getApiUserId, isVkLaunch } from './api';

export const App = () => {
  const { panel: activePanel = DEFAULT_VIEW_PANELS.HOME } = useActiveVkuiLocation();
  const routeNavigator = useRouteNavigator();
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
  const showTabbar = mainPanels.includes(activePanel);

  return (
    <SplitLayout center>
      <SplitCol width="100%" maxWidth={760} className={showTabbar ? 'app-with-tabbar' : ''}>
        <View activePanel={activePanel}>
          <Home id={DEFAULT_VIEW_PANELS.HOME} fetchedUser={fetchedUser} goals={goals} onOpenGoal={openGoal} onCreateGoal={openCustomGoal} onMark={markGoal} onAddValue={addValue} />
          <Goals id={DEFAULT_VIEW_PANELS.GOALS} goals={goals} onOpenGoal={openGoal} onCreateGoal={openCustomGoal} onMark={markGoal} onAddValue={addValue} />
          <Group id={DEFAULT_VIEW_PANELS.GROUP} goals={goals} fetchedUser={fetchedUser} onCreateGoal={openCustomGoal} serverError={serverError} />
          <Catalog id={DEFAULT_VIEW_PANELS.CATALOG} onSelect={selectTemplate} />
          <CreateGoal key={selectedTemplate?.id || 'custom'} id={DEFAULT_VIEW_PANELS.CREATE} template={selectedTemplate} onCreate={submitGoal} />
          <GoalDetails id={DEFAULT_VIEW_PANELS.GOAL} goals={goals} loading={!sharedLoaded} currentUserId={getApiUserId(fetchedUser)} onOpenGoal={openGoal} onMark={markGoal} onAddValue={addValue} onDelete={removeGoal} />
          <JoinGoal id={DEFAULT_VIEW_PANELS.JOIN} groupId={inviteGroupId} fetchedUser={fetchedUser} onAccept={acceptInvite} onDismiss={dismissInvite} />
        </View>
        {showTabbar && (
          <Tabbar>
            <TabbarItem selected={activePanel === DEFAULT_VIEW_PANELS.HOME} label="Сегодня" aria-label="Сегодня" onClick={() => routeNavigator.push('/')}>
              <Icon28HomeOutline />
            </TabbarItem>
            <TabbarItem selected={activePanel === DEFAULT_VIEW_PANELS.GOALS} label="Мои цели" aria-label="Мои цели" onClick={() => routeNavigator.push('/goals')}>
              <Icon28ListOutline />
            </TabbarItem>
            <TabbarItem selected={activePanel === DEFAULT_VIEW_PANELS.GROUP} label="Группа" aria-label="Группа" onClick={() => routeNavigator.push('/group')}>
              <Icon28Users3Outline />
            </TabbarItem>
          </Tabbar>
        )}
        {notice && <Snackbar duration={3000} onClose={() => setNotice('')} onClosed={() => setNotice('')}>{notice}</Snackbar>}
      </SplitCol>
      {popout}
    </SplitLayout>
  );
};
