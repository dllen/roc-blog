(function () {
    'use strict';

    function init() {
        var trigger = document.getElementById('tipping-trigger');
        var dialog = document.getElementById('tipping-dialog');

        if (!trigger || !dialog) {
            return;
        }

        var panel = dialog.querySelector('details');

        function isOpen() {
            return dialog.open === true || dialog.hasAttribute('open');
        }

        function setOpen(open) {
            if (open) {
                if (panel) {
                    panel.open = true;
                }
                if (typeof dialog.showModal === 'function') {
                    dialog.showModal();
                } else {
                    dialog.setAttribute('open', '');
                }
            } else if (typeof dialog.close === 'function') {
                dialog.close();
            } else {
                dialog.removeAttribute('open');
            }
            trigger.setAttribute('aria-expanded', open ? 'true' : 'false');
        }

        trigger.addEventListener('click', function () {
            setOpen(!isOpen());
        });

        dialog.addEventListener('click', function (event) {
            if (event.target === dialog) {
                setOpen(false);
            }
        });

        var closer = dialog.querySelector('[data-tipping-close]');
        if (closer) {
            closer.addEventListener('click', function () {
                setOpen(false);
            });
        }

        dialog.addEventListener('close', function () {
            trigger.setAttribute('aria-expanded', 'false');
        });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
