import { all, fork } from 'redux-saga/effects'
import { authSaga } from './authSaga'
import { projectsSaga } from './projectsSaga'
import { tasksSaga } from './tasksSaga'
import { teamsSaga } from './teamsSaga'
import { usersSaga } from './usersSaga'
import { reportsSaga } from './reportsSaga'
import { chatSaga } from './chatSaga'
import { chatbotSaga } from './chatbotSaga'
import { notificationsSaga } from './notificationsSaga'
import { dashboardSaga } from './dashboardSaga'
import { digitalMarketingSaga } from './digitalMarketingSaga'
import { sheetsSaga } from './sheetsSaga'

export function* rootSaga() {
  yield all([
    fork(authSaga),
    fork(projectsSaga),
    fork(tasksSaga),
    fork(teamsSaga),
    fork(usersSaga),
    fork(reportsSaga),
    fork(chatSaga),
    fork(chatbotSaga),
    fork(notificationsSaga),
    fork(dashboardSaga),
    fork(digitalMarketingSaga),
    fork(sheetsSaga),
  ])
}
