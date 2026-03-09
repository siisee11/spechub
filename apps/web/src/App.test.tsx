import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import App from './App';

describe('App', () => {
  it('renders SpecHub headline and positioning copy', () => {
    render(<App />);

    expect(screen.getByRole('heading', { name: 'SpecHub' })).toBeInTheDocument();
    expect(screen.getByText('Open community marketplace for sharable specs.')).toBeInTheDocument();
  });
});
