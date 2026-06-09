'use client';

import { Cell, Pie, PieChart, ResponsiveContainer } from 'recharts';

const TEAL = '#63c6b4';

export interface MiniDonutProps {
  filled: number;
  total?: number;
  className?: string;
}

export function MiniDonut({ filled, total = 100, className = 'h-14 w-14' }: MiniDonutProps) {
  const chartData = [
    { name: 'filled', value: filled },
    { name: 'rest', value: Math.max(0, total - filled) },
  ];

  return (
    <div className={className}>
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={chartData}
            innerRadius="55%"
            outerRadius="90%"
            dataKey="value"
            stroke="none"
            isAnimationActive={false}
          >
            <Cell fill={TEAL} />
            <Cell fill="#e4ddd0" />
          </Pie>
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}
