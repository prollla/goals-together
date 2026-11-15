import { Button, Div, Group, Header, Panel, PanelHeader } from '@vkontakte/vkui';
import { Icon28AddOutline } from '@vkontakte/icons';
import { useRouteNavigator } from '@vkontakte/vk-mini-apps-router';
import { Goal, NavIdProps } from '../types';
import { isCompleted } from '../utils/goals';
import { GoalActions, GoalCard } from '../components/GoalCard';

interface GoalsProps extends NavIdProps, GoalActions {
  goals: Goal[];
  onOpenGoal: (id: string) => void;
  onCreateGoal: () => void;
}

export const Goals = ({ id, goals, onOpenGoal, onCreateGoal, onMark, onAddValue, onResetDay }: GoalsProps) => {
  const routeNavigator = useRouteNavigator();
  const active = goals.filter((goal) => !isCompleted(goal));
  const finished = goals.filter(isCompleted);
  const renderCard = (goal: Goal) => (
    <GoalCard key={goal.id} goal={goal} onOpen={onOpenGoal} onMark={onMark} onAddValue={onAddValue} onResetDay={onResetDay} />
  );

  return (
    <Panel id={id}>
      <PanelHeader>Мои цели</PanelHeader>
      <Div className="top-actions">
        <Button stretched size="m" before={<Icon28AddOutline width={20} height={20} />} onClick={onCreateGoal}>Новая цель</Button>
        <Button stretched size="m" mode="secondary" onClick={() => routeNavigator.push('/catalog')}>Из шаблона</Button>
      </Div>
      <Group mode="plain" header={<Header size="s">Активные · {active.length}</Header>}>
        <Div className="goal-list">
          {active.map(renderCard)}
          {active.length === 0 && (
            <div className="empty-state">
              <p className="empty-state__text">
                {finished.length ? 'Все цели завершены. Самое время поставить новую.' : 'Пока нет ни одной цели. Добавьте первую с помощью кнопки выше.'}
              </p>
            </div>
          )}
        </Div>
      </Group>
      {finished.length > 0 && (
        <Group mode="plain" header={<Header size="s">Завершённые · {finished.length}</Header>}>
          <Div className="goal-list">{finished.map(renderCard)}</Div>
        </Group>
      )}
    </Panel>
  );
};
