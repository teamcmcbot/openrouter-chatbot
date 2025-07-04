import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import Input from '../../components/ui/Input';

describe('Input', () => {
  it('renders input with label', () => {
    render(<Input label="Email" />);
    
    const input = screen.getByLabelText(/email/i);
    const label = screen.getByText(/email/i);
    
    expect(input).toBeInTheDocument();
    expect(label).toBeInTheDocument();
  });

  it('displays helper text', () => {
    render(<Input label="Password" helperText="Must be at least 8 characters" />);
    
    const helperText = screen.getByText(/must be at least 8 characters/i);
    expect(helperText).toBeInTheDocument();
  });

  it('shows error state', () => {
    render(<Input label="Email" error="Invalid email format" />);
    
    const errorText = screen.getByText(/invalid email format/i);
    const input = screen.getByLabelText(/email/i);
    
    expect(errorText).toBeInTheDocument();
    expect(input).toHaveClass('border-red-500');
  });

  it('handles disabled state', () => {
    render(<Input label="Email" disabled />);
    
    const input = screen.getByLabelText(/email/i);
    expect(input).toBeDisabled();
    expect(input).toHaveClass('disabled:bg-gray-100');
  });
});
