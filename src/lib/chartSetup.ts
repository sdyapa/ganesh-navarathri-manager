import {
  BarElement,
  CategoryScale,
  Chart as ChartJS,
  Legend,
  LinearScale,
  LineElement,
  PointElement,
  Tooltip,
} from 'chart.js'

ChartJS.register(CategoryScale, LinearScale, BarElement, LineElement, PointElement, Legend, Tooltip)

export const CHART_COLORS = ['#ea580c', '#0f766e', '#7c3aed', '#c026d3', '#2563eb', '#65a30d', '#dc2626', '#0891b2']
