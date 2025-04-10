const tabButtonContainers = document.querySelectorAll('.tab-buttons');
tabButtonContainers.forEach(container => {
    container.addEventListener('click', (event) => {
        const clickedButton = event.target.closest('.tab-button'); // Use closest to handle clicks inside button
        if (clickedButton && clickedButton.getAttribute('role') === 'tab') { // Check if it's a tab button
            const targetTabId = clickedButton.dataset.tab;
            const parentSection = clickedButton.closest('.weather-section');
            if (!parentSection) return;

            // Update button states
            parentSection.querySelectorAll('.tab-button[role="tab"]').forEach(btn => {
                const isSelected = btn === clickedButton;
                btn.classList.toggle('active', isSelected);
                btn.setAttribute('aria-selected', isSelected);
                btn.setAttribute('tabindex', isSelected ? '0' : '-1'); // Manage focusability
            });

            // Update content panel states
            parentSection.querySelectorAll('.tab-content[role="tabpanel"]').forEach(content => {
                const isTargetContent = content.id === targetTabId;
                content.classList.toggle('active', isTargetContent);
                content.hidden = !isTargetContent; // Use hidden attribute
                content.setAttribute('tabindex', isTargetContent ? '0' : '-1'); // Allow panel focus when active
            });

            // Optional: Focus the clicked tab button
            // clickedButton.focus();
        }
    });

    // Optional: Add basic keyboard navigation (Left/Right arrows)
    container.addEventListener('keydown', (event) => {
        const target = event.target;
        if (target.getAttribute('role') === 'tab') {
            let newTarget = null;
            if (event.key === 'ArrowRight') {
                newTarget = target.nextElementSibling;
                if (!newTarget) { // Wrap around
                    newTarget = container.firstElementChild;
                }
            } else if (event.key === 'ArrowLeft') {
                newTarget = target.previousElementSibling;
                if (!newTarget) { // Wrap around
                    newTarget = container.lastElementChild;
                }
            }

            if (newTarget && newTarget.getAttribute('role') === 'tab') {
                newTarget.focus(); // Move focus
                newTarget.click(); // Activate the tab
                event.preventDefault(); // Prevent default arrow key behavior (scrolling)
            }
        }
    });
});
