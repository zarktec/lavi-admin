export interface SimInput {
  doses_per_day: number;
  duration_days: number;
  points_per_dose: number;
  welcome_points: number;
  max_points_per_treatment: number | null;
  streak_rules: { streak_length: number; bonus_points: number; repeatable: boolean }[];
}

/** Costo máximo por tratamiento (adherencia perfecta), en puntos y en pesos. */
export function simulateMaxCost(p: SimInput, pointValueCop: number) {
  const totalDoses = p.doses_per_day * p.duration_days;
  const dosePoints = totalDoses * p.points_per_dose;
  const streakPoints = p.streak_rules.reduce((sum, r) => {
    const hits = r.repeatable ? Math.floor(totalDoses / r.streak_length) : totalDoses >= r.streak_length ? 1 : 0;
    return sum + hits * r.bonus_points;
  }, 0);
  const uncapped = p.welcome_points + dosePoints + streakPoints;
  const total = p.max_points_per_treatment == null ? uncapped : Math.min(uncapped, p.max_points_per_treatment);
  return {
    total_doses: totalDoses,
    welcome_points: p.welcome_points,
    dose_points: dosePoints,
    streak_points: streakPoints,
    uncapped_points: uncapped,
    capped: total < uncapped,
    max_points: total,
    max_cost_cop: Math.round(total * pointValueCop),
  };
}
