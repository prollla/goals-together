import { useState } from 'react';
import { UserInfo } from '@vkontakte/vk-bridge';
import { Alert, Button, Div, Panel, PanelHeader, PanelHeaderBack } from '@vkontakte/vkui';
import { useSafeBack } from '../hooks/useSafeBack';
import { NavIdProps } from '../types';
import { deleteMyData } from '../api';
import { OPERATOR_NAME, PRIVACY_POLICY_URL, SUPPORT_URL } from '../config';

interface AboutProps extends NavIdProps {
  user?: UserInfo;
  onNotice: (message: string) => void;
  /** Called after the user's data was erased, to reload the (now empty) goal list. */
  onDataDeleted: () => void;
}

/** About the app, privacy summary and «Удалить мои данные» — expected by the VK Mini Apps catalog. */
export const About = ({ id, user, onNotice, onDataDeleted }: AboutProps) => {
  const goBack = useSafeBack();
  const [confirmOpen, setConfirmOpen] = useState(false);

  const erase = async () => {
    try {
      await deleteMyData(user);
      onNotice('Ваши данные удалены');
      onDataDeleted();
    } catch (error) {
      onNotice(error instanceof Error ? error.message : 'Не удалось удалить данные');
    }
  };

  return (
    <Panel id={id}>
      <PanelHeader before={<PanelHeaderBack onClick={goBack} />}>О приложении</PanelHeader>
      <Div className="about">
        <section className="about__section">
          <h2>Цели вместе</h2>
          <p>Трекер целей и привычек: отмечайте шаги каждый день, ставьте общие цели с друзьями и поддерживайте друг друга.</p>
        </section>

        <section className="about__section">
          <h3>Какие данные мы храним</h3>
          <ul>
            <li>ваш идентификатор ВКонтакте, имя и аватар — чтобы показывать вас участникам общих целей;</li>
            <li>ваши цели, отметки и поддержку от друзей;</li>
            <li>настройку напоминаний и ваш часовой пояс — чтобы напоминать вовремя.</li>
          </ul>
          <p>Данные хранятся на сервере приложения и не передаются третьим лицам. Прогресс в личных целях видите только вы, в общих — участники этой цели.</p>
          {OPERATOR_NAME && <p>Оператор данных: {OPERATOR_NAME}.</p>}
          {PRIVACY_POLICY_URL && (
            <p><a href={PRIVACY_POLICY_URL} target="_blank" rel="noreferrer">Полная политика конфиденциальности</a></p>
          )}
        </section>

        <section className="about__section">
          <h3>Связаться с нами</h3>
          <p>Вопросы, идеи и сообщения об ошибках: <a href={SUPPORT_URL} target="_blank" rel="noreferrer">{SUPPORT_URL.replace(/^https?:\/\//, '')}</a></p>
        </section>

        <section className="about__section">
          <h3>Удаление данных</h3>
          <p>Можно удалить всё, что приложение о вас хранит. Общие цели, где вы автор, перейдут следующему участнику, чтобы у друзей сохранился прогресс.</p>
          <Button className="delete-goal-button" size="m" mode="secondary" onClick={() => setConfirmOpen(true)}>Удалить мои данные</Button>
        </section>
      </Div>

      {confirmOpen && (
        <Alert
          title="Удалить все ваши данные?"
          description="Будут удалены ваши цели, отметки, поддержка и настройки. Это действие нельзя отменить."
          actionsLayout="vertical"
          actions={[
            { title: 'Удалить всё', mode: 'destructive', autoCloseDisabled: true, action: () => { setConfirmOpen(false); void erase(); } },
            { title: 'Отмена', mode: 'cancel' },
          ]}
          onClose={() => setConfirmOpen(false)}
          onClosed={() => setConfirmOpen(false)}
          dismissLabel="Закрыть"
        />
      )}
    </Panel>
  );
};
