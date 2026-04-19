document.addEventListener('DOMContentLoaded', () => {
    const steps = Array.from(document.querySelectorAll('.form-step'));
    const nextBtns = document.querySelectorAll('.next-btn');
    const prevBtns = document.querySelectorAll('.prev-btn');
    const trackers = document.querySelectorAll('.step');
    const form = document.getElementById('briefForm');
    const notificationObj = document.getElementById('notificationObj');
    
    let currentStep = 0;

    function updateFormSteps() {
        // Hide all steps
        steps.forEach(step => step.classList.remove('active'));
        trackers.forEach(track => track.classList.remove('active'));
        
        // Show current step
        steps[currentStep].classList.add('active');
        
        // Update tracker logic
        for (let i = 0; i <= currentStep; i++) {
            trackers[i].classList.add('active');
        }
    }

    // Function to check validity of required fields in the current step
    function validateCurrentStep() {
        const currentInputs = steps[currentStep].querySelectorAll('input[required], select[required], textarea[required]');
        let isValid = true;
        currentInputs.forEach(input => {
            if (!input.checkValidity()) {
                input.reportValidity();
                isValid = false;
            }
        });
        return isValid;
    }

    nextBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            if (validateCurrentStep()) {
                if (currentStep < steps.length - 1) {
                    currentStep++;
                    updateFormSteps();
                }
            }
        });
    });

    prevBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            if (currentStep > 0) {
                currentStep--;
                updateFormSteps();
            }
        });
    });

    // File Drop UI
    const fileInput = document.querySelector('.file-input');
    if (fileInput) {
        fileInput.addEventListener('change', function() {
            const msg = document.querySelector('.file-msg');
            if (this.files.length > 0) {
                msg.textContent = `${this.files.length} archivo(s) seleccionado(s)`;
            } else {
                msg.textContent = 'Arrastra tus archivos aquí o haz clic para subir';
            }
        });
    }

    // Form Submission
    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        if (!validateCurrentStep()) return;
        
        const submitBtn = document.querySelector('.cta-btn');
        submitBtn.disabled = true;
        submitBtn.textContent = 'Enviando...';
        notificationObj.textContent = '';
        notificationObj.className = 'notification-area'; // reset classes

        const formData = new FormData(form);

        try {
            const response = await fetch('/api/briefs', {
                method: 'POST',
                body: formData // No Headers needed for FormData, fetch sets it to multipart/form-data
            });

            const result = await response.json();

            if (response.ok && result.success) {
                // Success
                notificationObj.textContent = result.message;
                notificationObj.classList.add('success');
                form.reset();
                currentStep = 0;
                updateFormSteps();
                if(document.querySelector('.file-msg')) {
                    document.querySelector('.file-msg').textContent = 'Arrastra tus archivos aquí o haz clic para subir';
                }
            } else {
                throw new Error(result.error || 'Error al enviar el formulario');
            }
        } catch (error) {
            console.error(error);
            notificationObj.textContent = 'Error: No se pudo enviar la ficha. Inténtalo de nuevo.';
            notificationObj.classList.add('error');
        } finally {
            submitBtn.disabled = false;
            submitBtn.textContent = 'Enviar Ficha';
        }
    });
});
