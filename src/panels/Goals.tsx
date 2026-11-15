import { Button, Caption, Div, Group, Header, Panel, PanelHeader, Text } from '@vkontakte/vkui';
import { Icon28AddOutline } from '@vkontakte/icons';
import { useRouteNavigator } from '@vkontakte/vk-mini-apps-router';
import { Goal, NavIdProps } from '../types';
import { GoalCard } from '../components/GoalCard';

interface GoalsProps extends NavIdProps {
  goals: Goal[];
  onOpenGoal: (id: string) => void;
  onCreateGoal: () => void;
  onMark: (id: string, status: 'done' | 'skipped') => void;
  onAddValue: (id: string, value: number) => void;
}

export const Goals = ({ id, goals, onOpenGoal, onCreateGoal, onMark, onAddValue }: GoalsProps) => {
  const routeNavigator = useRouteNavigator();

  return (
    <Panel id={id}>
      <PanelHeader>Мои цели</PanelHeader>
      <Div className="create-goal-action">
        <Button stretched size="l" before={<Icon28AddOutline />} onClick={onCreateGoal}>Добавить цель</Button>
        <Button stretched size="m" mode="secondary" onClick={() => routeNavigator.push('/catalog')}>
          Открыть каталог шаблонов
        </Button>
        <Caption className="section-note">Название, срок и правило можно изменить при создании.</Caption>
      </Div>
      <Group mode="plain" header={<Header size="s">Активные · {goals.length}</Header>}>
        <Div className="goal-list">
          {goals.map((goal) => (
            <GoalCard key={goal.id} goal={goal} onOpen={onOpenGoal} onMark={onMark} onAddValue={onAddValue} />
          ))}
          {goals.length === 0 && (
            <div className="empty-state"><Text>Пока нет ни одной цели. Добавьте первую с помощью кнопки выше.</Text></div>
          )}
        </Div>
      </Group>
    </Panel>
  );
};
