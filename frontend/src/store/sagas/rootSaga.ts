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
import { hrEmployeesSaga } from './hrEmployeesSaga'
import { hrOrgSaga } from './hrOrgSaga'
import { hrDocumentsSaga } from './hrDocumentsSaga'
import { hrTimeSaga } from './hrTimeSaga'
import { hrRecruitmentSaga } from './hrRecruitmentSaga'
import { hrPerformanceSaga } from './hrPerformanceSaga'
import { hrDashboardSaga } from './hrDashboardSaga'

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
    fork(hrEmployeesSaga),
    fork(hrOrgSaga),
    fork(hrDocumentsSaga),
    fork(hrTimeSaga),
    fork(hrRecruitmentSaga),
    fork(hrPerformanceSaga),
    fork(hrDashboardSaga),
  ])
}
