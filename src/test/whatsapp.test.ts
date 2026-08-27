import { describe, expect, it } from 'vitest'
import { DEFAULT_COMMODITY_TEMPLATE, DEFAULT_MONETARY_TEMPLATE, renderWhatsAppTemplate } from '@/lib/whatsapp'

describe('renderWhatsAppTemplate', () => {
  it('substitutes every placeholder in the default monetary template', () => {
    const message = renderWhatsAppTemplate(DEFAULT_MONETARY_TEMPLATE, {
      donorName: 'Ramesh',
      donationType: 'Monetary',
      amount: 5000,
      date: '2026-08-27',
      category: 'Chanda',
      year: 2026,
    })
    expect(message).toContain('Ramesh')
    expect(message).toContain('₹5,000')
    expect(message).toContain('27-Aug-2026')
    expect(message).toContain('Chanda')
    expect(message).not.toContain('{{')
  })

  it('substitutes every placeholder in the default commodity template', () => {
    const message = renderWhatsAppTemplate(DEFAULT_COMMODITY_TEMPLATE, {
      donorName: 'Lakshmi',
      donationType: 'Commodity',
      commodityName: 'Rice',
      quantity: 50,
      unit: 'kg',
      date: '2026-08-27',
      category: 'Annadanam',
      year: 2026,
    })
    expect(message).toContain('Rice')
    expect(message).toContain('50 kg')
    expect(message).not.toContain('{{')
  })

  it('leaves unknown placeholders untouched instead of throwing', () => {
    const message = renderWhatsAppTemplate('Hello {{donorName}}, {{unknownPlaceholder}}', {
      donorName: 'Ramesh',
      donationType: 'Monetary',
      date: '2026-08-27',
      category: 'Chanda',
      year: 2026,
    })
    expect(message).toBe('Hello Ramesh, {{unknownPlaceholder}}')
  })

  it('never executes a template as code — plain substitution only', () => {
    const malicious = '{{donorName}}${1+1}`code`'
    const message = renderWhatsAppTemplate(malicious, {
      donorName: 'Ramesh',
      donationType: 'Monetary',
      date: '2026-08-27',
      category: 'Chanda',
      year: 2026,
    })
    expect(message).toBe('Ramesh${1+1}`code`')
  })
})
