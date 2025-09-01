import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';

// Under test
import ActionSheet from '../../components/ui/ActionSheet';

describe('ActionSheet', () => {
  it('renders items and calls onSelect', () => {
    const onClose = jest.fn();
    const onFirst = jest.fn();
    const onSecond = jest.fn();

    render(
      <ActionSheet
        isOpen
        title="Conversation actions"
        onClose={onClose}
        items={[
          { key: 'delete', label: 'Delete Conversation', onSelect: onFirst, destructive: true },
          { key: 'edit', label: 'Edit Title', onSelect: onSecond },
        ]}
      />
    );

    // Items rendered
    expect(screen.getByRole('dialog', { name: 'Conversation actions' })).toBeInTheDocument();
    const deleteBtn = screen.getByRole('button', { name: 'Delete Conversation' });
    const editBtn = screen.getByRole('button', { name: 'Edit Title' });
    expect(deleteBtn).toBeInTheDocument();
    expect(editBtn).toBeInTheDocument();

    // Click first item
    fireEvent.click(deleteBtn);
    expect(onFirst).toHaveBeenCalledTimes(1);

    // Backdrop click closes
    fireEvent.click(screen.getByText('Cancel'));
    expect(onClose).toHaveBeenCalled();
  });
});
