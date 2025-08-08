import { render, screen } from '@testing-library/react';
import UserSettings from '../../../components/ui/UserSettings';

describe('UserSettings', () => {
  it('renders when open', () => {
    render(<UserSettings isOpen={true} onClose={() => {}} />);
    expect(screen.getByText('Settings')).toBeInTheDocument();
    expect(screen.getByText('Profile')).toBeInTheDocument();
  });

  it('does not render when closed', () => {
    const { container } = render(<UserSettings isOpen={false} onClose={() => {}} />);
    expect(container.firstChild).toBeNull();
  });
});
