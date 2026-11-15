import { useCallback } from 'react';
import { useFirstPageCheck, useRouteNavigator } from '@vkontakte/vk-mini-apps-router';

export const useSafeBack = (fallbackPath = '/') => {
  const routeNavigator = useRouteNavigator();
  const isFirstPage = useFirstPageCheck();

  return useCallback(() => {
    if (isFirstPage) {
      void routeNavigator.replace(fallbackPath);
      return;
    }
    void routeNavigator.back();
  }, [fallbackPath, isFirstPage, routeNavigator]);
};
