export function recordPayment({ userId, name, role, feature, amount, method }) {
  const payments = JSON.parse(localStorage.getItem('all_payments') || '[]')
  const payment = {
    id: `PAY_${Date.now()}`,
    userId,
    name,
    role,
    feature,
    amount,
    method,
    status: 'success',
    timestamp: new Date().toISOString(),
  }
  payments.push(payment)
  localStorage.setItem('all_payments', JSON.stringify(payments))
  return payment
}

export function getAllPayments() {
  return JSON.parse(localStorage.getItem('all_payments') || '[]')
}

export function getTotalRevenue() {
  return getAllPayments().filter(p => p.status === 'success').reduce((sum, p) => sum + p.amount, 0)
}