import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import Home from './page';

describe('Home Page', () => {
  it('renders the main heading', () => {
    render(<Home />);
    const heading = screen.getByRole('heading', { name: /ShiftSync Platform/i });
    expect(heading).toBeInTheDocument();
  });

  it('renders the welcome message with the dummy user name', () => {
    render(<Home />);
    const welcomeMessage = screen.getByText(/Welcome, Admin User/i);
    expect(welcomeMessage).toBeInTheDocument();
  });
});
