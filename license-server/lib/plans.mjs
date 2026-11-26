export const PLANS = {
  standard: {
    label: 'Standard',
    defaultSeats: 1,
    features: ['desktop', 'mobile', 'updates'],
  },
  pro: {
    label: 'Pro',
    defaultSeats: 3,
    features: ['desktop', 'mobile', 'updates', 'priority'],
  },
  team: {
    label: 'Team',
    defaultSeats: 10,
    features: ['desktop', 'mobile', 'updates', 'priority', 'admin'],
  },
};

export function planLabel(plan) {
  return PLANS[plan]?.label ?? plan;
}

export function featuresForPlan(plan) {
  return (PLANS[plan]?.features ?? PLANS.standard.features).slice();
}

export function defaultSeatsForPlan(plan) {
  return PLANS[plan]?.defaultSeats ?? 1;
}
