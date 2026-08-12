"""HR Controller models (docs/hr.md §41 MVP)."""

from models.hr.employee import (
    EmployeeCreate,
    EmployeeUpdate,
    EmployeeResponse,
    EmployeeDetailResponse,
    OrgChartNode,
    EMPLOYMENT_TYPES,
    EMPLOYMENT_STATUSES,
    WORK_MODES,
    PROBATION_STATUSES,
)
from models.hr.designation import (
    DesignationCreate,
    DesignationUpdate,
    DesignationResponse,
)
from models.hr.compensation import (
    CompensationCreate,
    CompensationResponse,
    PAY_FREQUENCIES,
)

__all__ = [
    "EmployeeCreate", "EmployeeUpdate", "EmployeeResponse", "EmployeeDetailResponse",
    "OrgChartNode",
    "EMPLOYMENT_TYPES", "EMPLOYMENT_STATUSES", "WORK_MODES", "PROBATION_STATUSES",
    "DesignationCreate", "DesignationUpdate", "DesignationResponse",
    "CompensationCreate", "CompensationResponse", "PAY_FREQUENCIES",
]
