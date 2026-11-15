import { CSSProperties } from 'react';
import { Avatar, Button, Caption, Div, Group, Header, Panel, PanelHeader, Text, Title } from '@vkontakte/vkui';
import { Icon28AddOutline, Icon28Users3Outline } from '@vkontakte/icons';
import { UserInfo } from '@vkontakte/vk-bridge';
import { useRouteNavigator } from '@vkontakte/vk-mini-apps-router';
import { Goal, NavIdProps } from '../types';
import { formatToday, isDone, plural, toDateKey } from '../utils/goals';
import { GoalCard } from '../components/GoalCard';

interface HomeProps extends NavIdProps {
  fetchedUser?: UserInfo;
  goals: Goal[];
  serverError?: string;
  onOpenGoal: (id: string) => void;
  onCreateGoal: () => void;
  onMark: (id: string, status: 'done' | 'skipped') => void;
  onAddValue: (id: string, value: number) => void;
}

export const Home = ({ id, fetchedUser, goals, serverError, onOpenGoal, onCreateGoal, onMark, onAddValue }: HomeProps) => {
  const routeNavigator = useRouteNavigator();
  const completed = goals.filter((goal) => isDone(goal.entries[toDateKey()])).length;
  const progress = goals.length ? Math.round((completed / goals.length) * 100) : 0;
  const allDone = goals.length > 0 && completed === goals.length;

  return (
    <Panel id={id}>
      <PanelHeader>Цели вместе</PanelHeader>
      <Div className="welcome-block">
        <div>
          <Caption className="welcome-block__date">{formatToday()}</Caption>
          <Title level="1" weight="2" className="welcome-block__title">Привет, {fetchedUser?.first_name || 'друг'}!</Title>
          <Text>Маленький шаг сегодня важнее идеального плана.</Text>
        </div>
        <Avatar size={52} src={fetchedUser?.photo_200} initials={fetchedUser?.first_name?.slice(0, 1) || 'В'} gradientColor="blue" />
      </Div>

      <Div>
        <div className="daily-summary">
          <div className="daily-summary__content">
            <Caption className="daily-summary__eyebrow">Ваш фокус на сегодня</Caption>
            <Title level="2" weight="2" className="daily-summary__title">
              {goals.length === 0 ? 'Начните с первой цели' : allDone ? 'Всё выполнено!' : `${completed} из ${goals.length} ${plural(goals.length, ['цели', 'целей', 'целей'])}`}
            </Title>
            <Text className="daily-summary__text">
              {goals.length === 0 ? 'Определите небольшой шаг, который хотите сделать.' : allDone ? 'Отличная работа. Можно выдохнуть.' : 'Отметьте прогресс — без давления и обязательств.'}
            </Text>
          </div>
          <div className="progress-ring" role="img" aria-label={`Дневной прогресс: ${progress}%`} style={{ '--progress': `${progress * 3.6}deg` } as CSSProperties}>
            <span>{progress}%</span>
          </div>
        </div>
      </Div>

      {serverError && (
        <Div>
          <div className="server-banner" role="alert">Общие цели сейчас недоступны: {serverError}</div>
        </Div>
      )}

      <Div className="top-actions">
        <Button stretched size="m" before={<Icon28AddOutline width={20} height={20} />} onClick={onCreateGoal}>Новая цель</Button>
        <Button stretched size="m" mode="secondary" onClick={() => routeNavigator.push('/catalog')}>Из шаблона</Button>
      </Div>

      <Group mode="plain" header={<Header size="s">Что отметить сегодня</Header>}>
        <Div className="goal-list">
          {goals.map((goal) => (
            <GoalCard key={goal.id} goal={goal} onOpen={onOpenGoal} onMark={onMark} onAddValue={onAddValue} />
          ))}
          {goals.length === 0 && (
            <div className="empty-state">
              <Title level="2" weight="2">Здесь появятся ваши цели</Title>
              <Text>Нажмите «Добавить цель» выше или начните с готового шаблона.</Text>
            </div>
          )}
        </Div>
      </Group>

      <Group mode="plain">
        <Div>
          <button type="button" className="support-card" onClick={() => routeNavigator.push('/group')}>
            <span className="support-card__icon"><Icon28Users3Outline /></span>
            <span className="support-card__body">
              <Title level="3" weight="2">Двигайтесь вместе</Title>
              <Caption>Создайте общую цель и пригласите друзей поддерживать друг друга.</Caption>
            </span>
            <span className="support-card__action">В группу</span>
          </button>
        </Div>
      </Group>
    </Panel>
  );
};
