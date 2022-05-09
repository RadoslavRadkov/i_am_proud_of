wizards = {}; // list of all wizards

class Wizard {
    // Events
    // 'wizard.step.hide'
    // 'wizard.step.show'
    // 'wizard.step.forward'
    // 'wizard.step.forward.change'
    // 'wizard.step.back'
    // 'wizard.finish.success'
    //
    // 'wizard.close'

    /**
     * Get wizard by id or jq object
     *
     * @param _wizard
     * @param _step
     * @param _inputData
     * @returns {*}
     */
    static get (_wizard, _step, _inputData) {
        let wizardId = _wizard;

        // if wizard is not id and is object
        if (typeof wizardId === 'object') {
            // get wizard id
            wizardId = _wizard.attr('id')
            if(wizardId == null) {
                wizardId = createElementId('wizard')
            }

            // set id for anyway
            _wizard.attr('id', wizardId);
        } else {
            _wizard = $('#' + wizardId);
        }

        // check if wizard is already exist in wizards map
        if(wizards[wizardId] == null) {
            // if not isset in wizards that mean not created
            wizards[wizardId] = new Wizard(_wizard, _step, _inputData);
        }

        // return Wizard Object
        return wizards[wizardId];
    }

    /**
     * Construct new Wizard Object
     *
     * @param _element - wizard class jq object selector
     * @param _currentStep - step for start wizard
     * @param _inputData - default input data
     */
    constructor (_element, _currentStep, _inputData) {
        this.stepsHistory = [];
        this.inputData = {};
        this.inputDefaultData = {};
        this.inputDataErrors = {};

        this.id = _element.attr('id');

        this.element = _element;
        this.modal = $(this.element.parents('.modal'));

        this.setWizardEvents();

        // if wizard has error from his start
        if(this.goToFirstError()) {
            return this;
        }

        this.saveDataForInputs(_inputData, true);

        this.showStep(_currentStep);
    }

    /* destroy wizard */
    destroyWizard(_hide) {
        // prevent maximum call stack size on modal('hide')
        if(_hide !== false) {
            this.modal.addClass('necessarily-destroy').modal('hide').removeClass('necessarily-destroy');
        }

        this.removeWizardEvents();
        delete wizards[this.id];
    }

    /**
     * Continue initialization with events for steps
     */
    setWizardEvents () {
        let _this1 = this;

        // 0. finishing - when data-step-action is "finish", send data from wizard
        _this1.element.on('click', '[data-step-action="finishing"]', function () {
            _this1.sendPost();
        });

        // 1. continue - when data-step-action is "next", move step forward
        _this1.element.on('click', '[data-step-action="next"]', function () {
            _this1.stepForward();
        });

        // 2. return back - when data-step-action is "back", move step back
        _this1.element.on('click', '[data-step-action="back"]', function () {
            _this1.stepBack();
        });

        // 3. change step - when step has radio buttons to change direction to continue
        // and one of them is changed, changing input data-next-step=""
        _this1.element.on('change', '[data-step-change]', function () {
            _this1.changeNextStepValue($(this).val());
        });

        // 5. error - when wizard return error
        _this1.element.on('wizard.finish.error', function () {
            _this1.goToFirstError();
        });
    }

    /**
     * Continue initialization with events for steps
     */
    removeWizardEvents () {
        // 0. finishing - when data-step-action is "finish", send data from wizard
        this.element.off('click', '[data-step-action="finishing"]');

        // 1. continue - when data-step-action is "next", move step forward
        this.element.off('click', '[data-step-action="next"]');

        // 2. return back - when data-step-action is "back", move step back
        this.element.off('click', '[data-step-action="back"]');

        // 3. change step - when step has radio buttons to change direction to continue
        // and one of them is changed, changing input data-next-step=""
        this.element.off('change', '[data-step-change]');

        // 5. error - when wizard return error
        this.element.off('wizard.finish.error');
    }

    /** Actions **/

    // send post
    sendPost () {
        let _this6 = this;

        this.saveDataFromStepInputs(_this6.currentStep);

        let submitButton = _this6.element.find('[data-submit]');
        let action = submitButton.attr('data-action');

        _this6.loader(true);
        $.post(action, _this6.inputData, function(data) {
            if(data.result === 'success') {
                _this6.showStep('success');

                triggerEvent('wizard.finish.success', {
                    wizard: _this6,
                    responseData: data
                }, _this6.element);

                _this6.resetData();
            } else if(data.result === 'input-errors') {
                // trigger event
                _this6.inputDataErrors = data.msg;

                triggerEvent('wizard.finish.error', {
                    wizard: _this6,
                    messages: Object.assign({}, data.msg),
                }, _this6.element);
            }

            if(data.validationRules != undefined) {
                _this6.setNewValidationRules(data.validationRules);
            }

            _this6.loader(false);
        });
    }

    setNewValidationRules(rules) {
        $.each(rules, function (key, value) {
            if(key !== 'other') {
                window[key] = value;
            } else {
                reCheck[key] = value;
            }
        });
    }

    resetData() {
        this.inputData = {};
        this.inputDataErrors = {};
        this.stepsHistory = [];
    }

    loader(boolean) {
        if(boolean === true) {
            this.element.addClass('loading');

            let loaderWrap = this.element.find('.loader-wrap');
            if(loaderWrap.length < 1) {
                loaderWrap = $('<div class="dimmer"><div class="dimmer-content"></div><div class="loader"></div></div>');

                $(this.element).append(loaderWrap);
            }
        } else {
            this.element.removeClass('loading');
        }
    }

    // show step
    showStep (_step) {
        // currentStep is from function or is the first in wizard
        let currentStep = this.currentStep;

        let newCurrentStep_object, newCurrentStep;
        if(_step !== undefined) {
            newCurrentStep = _step;
            newCurrentStep_object = this.element.find('[data-step="' + _step + '"]');
        }
        if(newCurrentStep_object === undefined || newCurrentStep_object.length < 1) {
            newCurrentStep = this.firstStep().attr('data-step');
            newCurrentStep_object = this.element.find('[data-step="' + newCurrentStep + '"]');
        }

        // if new step is last in history prevent duplicate
        let currentStep_object = this.element.find('[data-step].activeStep');

        // trigger event
        let eventHideCurrent = triggerEvent('wizard.step.hide', {
            currentStep: currentStep,
            newStep: newCurrentStep,
            currentStep_obj: currentStep_object,
            newCurrentStep_obj: newCurrentStep_object,
        }, this.element);
        // check event prevented
        if (eventHideCurrent.isDefaultPrevented()) {
            return;
        }

        this.saveDataFromStepInputs(this.currentStep);

        // trigger event
        let eventShowNewCurrent = triggerEvent('wizard.step.show', {
            currentStep: newCurrentStep,
            lastStep: currentStep,
            newCurrentStep_obj: newCurrentStep_object,
            currentStep_obj: currentStep_object,
        }, this.element);
        // check event prevented
        if (eventShowNewCurrent.isDefaultPrevented()) {
            return;
        }

        // change is complete
        this.lastStep = currentStep;
        this.currentStep = newCurrentStep;

        // continue
        if(this.stepsHistory[this.stepsHistory.length - 1] !== this.currentStep) {
            this.stepsHistory.push(this.currentStep);
        }
        this.setDataToStep(this.currentStep);
        this.showErrorsInStep(this.currentStep);

        // hide back btn if not exist back step in history
        newCurrentStep_object.find('[data-step-action="back"]').attr('hidden', !(this.stepsHistory.length > 1));

        // add x
        if(!newCurrentStep_object.hasClass('noCloseX')) {
            let x = newCurrentStep_object.find('button.close.x');
            if (x.length < 1) {
                x = $('<button type="button" class="close x" data-dismiss="modal" aria-label="Close"></button>');
                newCurrentStep_object.append(x);
            }
        }

        // trigger event
        triggerEvent('wizard.step.hidden', {
            currentStep: currentStep,
            lastStep: newCurrentStep,
            newCurrentStep_obj: currentStep_object,
            currentStep_obj: newCurrentStep_object,
        }, this.element);
        // hide	currentStep
        currentStep_object.removeClass('activeStep') // remove class
            .hide(); // hide

        // trigger event
        triggerEvent('wizard.step.shown', {
            currentStep: newCurrentStep,
            lastStep: currentStep,
            newCurrentStep_obj: newCurrentStep_object,
            currentStep_obj: currentStep_object,
        }, this.element);
        // show new currentStep
        newCurrentStep_object.addClass('activeStep') // add active class
            .show(); // show new current step
    }

    // Showing next step
    stepForward () {
        let currentStep_object = $(this.element.find('[data-step="' + this.currentStep + '"]'));
        let nextStep_input = $(currentStep_object.find('[data-next-step]'));
        let nextStep = nextStep_input.attr('data-next-step');
        let nextStep_object = $(this.element.find('[data-step="' + nextStep + '"]'));

        // trigger event
        let event = triggerEvent('wizard.step.forward', {
            currentStep: this.currentStep,
            nextStep: nextStep,
            currentStep_obj: currentStep_object,
            nextStep_obj: nextStep_object,
        }, this.element);
        // check event prevented
        if (event.isDefaultPrevented()) {
            return;
        }

        // move
        this.showStep(nextStep);
    }

    // Showing last step
    stepBack () {
        if(this.stepsHistory.length > 1) {
            // only if isset more that one step

            let currentStep_object = $(this.element.find('[data-step="' + this.currentStep + '"]'));
            let nextStep = this.stepsHistory[this.stepsHistory.length - 2];
            let nextStep_object = $(this.element.find('[data-step="' + nextStep + '"]'));

            // trigger event
            let event = triggerEvent('wizard.step.back', {
                currentStep: this.currentStep,
                nextStep: nextStep,
                currentStep_obj: currentStep_object,
                nextStep_obj: nextStep_object,
            }, this.element);
            // check event prevented
            if (event.isDefaultPrevented()) {
                return;
            }

            this.stepsHistory.pop();

            // move
            this.showStep(nextStep);
        }
    }

    // Change next step value
    // Param: nestStep - string - id, name or any value for data-step
    changeNextStepValue (_nextStep) {
        let currentStep_object = $(this.element.find('[data-step="' + this.currentStep + '"]'));

        // trigger event
        let event = triggerEvent('wizard.step.forward.change', {
            nextStep: _nextStep,
            currentStep_obj: currentStep_object,
        }, this.element);
        // check event prevented
        if (event.isDefaultPrevented()) {
            return;
        }

        // when nextStep is not still null then make change
        $(currentStep_object.find('[data-next-step]')).attr('data-next-step', _nextStep);

    }

    // Get all error and go to first step with one
    goToFirstError () {
        let _this2 = this;

        let inputs = _this2.element.find('input[name], textarea[name]');
        inputs.each(function (key, html) {
            let input = $(html);

            let name = input.attr('name');

            if(_this2.inputDataErrors[name] !== undefined) {
                let step = $(input.parents('[data-step]')).attr('data-step');

                if(_this2.stepsHistory.includes(step)) {
                    _this2.showStep(step);

                    return true;
                }
            }
        });

        if(_this2.inputDataErrors.length > 0) {
            _this2.showStep(_this2.firstStep());

            return true;
        }
    }

    showErrorsInStep (step) {
        let _this5 = this;
        let dataStepHtml = _this5.element.find('[data-step="' + step + '"]');

        let inputs = dataStepHtml.find('input[name], textarea[name]');

        inputs.each(function (key, value) {
            let input = $(value);
            if(input.attr('type') != 'hidden') {
                let parent = input.parents('.form-fieldset');
                if(parent.length < 1) {
                    parent = input.parent();
                } else {
                    parent = parent.parent();
                }

                let alert = parent.find('.alert-danger-wrap');
                if (alert.length < 1) {
                    alert = $('<div class="alert-danger-wrap mt-1" style="flex-basis: 100%;"><div class="alert alert-danger" style="width: fit-content;"></div></div>');
                    parent.append(alert);
                }

                if (_this5.inputDataErrors[input.attr('name')] != null) {
                    alert.find('.alert').html(_this5.inputDataErrors[input.attr('name')]).show();
                    delete _this5.inputDataErrors[input.attr('name')];
                } else {
                    alert.remove();
                }
            }
        });
    }

    setDataToStep (step) {
        let _this3 = this;

        let dataStepHtml = _this3.element.find('[data-step="' + step + '"]');

        let inputs = dataStepHtml.find('input[name], textarea[name]');

        inputs.each(function (key, value) {
            let input = $(value);

            if(input.prop('disabled') == true || _this3.inputData[input.attr('name')] == null && input.attr('data-step-change') != null) {
            } else {
                if( input.attr('type') == 'radio' || input.attr('type') == 'checkbox' ) {

                    if(_this3.inputData[input.attr('name')] == input.val()) {
                        input.prop("checked", true).trigger('change');
                    } else if(input.attr('type') != 'radio') {
                        input.prop("checked", false).trigger('change');
                    }

                } else {
                    input.val(_this3.inputData[input.attr('name')]).trigger('change');
                }
            }
        });
    }

    saveDataFromStepInputs (step) {
        let _this4 = this;

        if(_this4.i === undefined) {
            _this4.i = 0;
        }

        let dataStepHtml = this.element.find('[data-step="' + step + '"]');

        let inputs = dataStepHtml.find('input[name], textarea[name]');

        inputs.each(function (key, value) {
            let input = $(value);

            let n = input.serializeArray()[0];
            if(n !== undefined) {
                let name = n['name'];

                const regex = /\[\]/i;
                let m;

                while ((m = regex.exec(name)) !== null) {
                    // This is necessary to avoid infinite loops with zero-width matches
                    if (m.index === regex.lastIndex) {
                        regex.lastIndex++;
                    }

                    // The result can be accessed through the `m`-variable.
                    m.forEach((match, groupIndex) => {
                        name = name.replace(regex, '[' + (_this4.i++) + ']');

                        if (dataStepHtml.find('[name="' + name + '"]').length > 0) {
                            name = n['name'];
                        }
                    });
                }

                if (name !== n['name']) {
                    input.attr('name', name);
                }

                _this4.inputData[name] = n['value'];
            } else {
                if(_this4.inputData[input.attr('name')] !== undefined)
                    delete _this4.inputData[input.attr('name')];
            }
        });
    }

    saveDataForInputs (data, defaultData) {
        let _this5 = this;

        $.each( data, function( key, value ) {
            _this5.inputData[key] = value;

            if(defaultData == true) {
                _this5.inputDefaultData[key] = value;
            }
        });
    }

    /** Properties */

    // first step
    firstStep () {
        return $(this.element.find('[data-step]')[0]);
    }
}
// wizard end