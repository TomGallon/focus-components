import React, {Component, PropTypes} from 'react';
import ReactDOM from 'react-dom';
import MDBehaviour from '../behaviours/material';
import i18next from 'i18next';

import closest from 'closest';
import debounce from 'lodash/debounce';
import uniqueId from 'lodash/uniqueId';

const ENTER_KEY_CODE = 13;
const TAB_KEY_CODE = 27;
const UP_ARROW_KEY_CODE = 38;
const DOWN_ARROW_KEY_CODE = 40;

@MDBehaviour('inputText')
class Autocomplete extends Component {
    constructor(props) {
        super(props);
        const state = {
            focus: false,
            inputValue: this.props.rawInputValue,
            options: new Map(),
            active: null,
            selected: this.props.rawInputValue,
            fromKeyResolver: false,
            suggestions: [],
            isLoading: false,
            customError: this.props.customError,
            totalCount: 0
        };
        this.state = state;
        this.autocompleteId = uniqueId('autocomplete-text-');
    };

    componentDidMount() {
        const {rawInputValue, keyResolver, inputTimeout} = this.props;
        // rawInputValue is defined, call the keyResolver to get the associated label
        if (rawInputValue !== undefined && rawInputValue !== null) {
            keyResolver(rawInputValue).then(inputValue => {
                if(this.props.rawInputValue !== '') {
                    this.setState({inputValue, fromKeyResolver: true})
                }
            }).catch(error => this.setState({customError: error.message}));
        }
        document.addEventListener('click', this._handleDocumentClick);
        this._debouncedQuerySearcher = debounce(this._querySearcher, inputTimeout);
    };

    componentWillReceiveProps({rawInputValue, customError, error}) {
        const {keyResolver} = this.props;
        if (rawInputValue !== this.props.rawInputValue && rawInputValue !== undefined && rawInputValue !== null) { // rawInputValue is defined, call the keyResolver to get the associated label
            this.setState({inputValue: rawInputValue, customError}, () => keyResolver(rawInputValue).then(inputValue => {
                this.setState({inputValue, fromKeyResolver: true});
            }).catch(error => this.setState({customError: error.message})));
        } else if (customError !== this.props.customError) {
            this.setState({customError});
        }
        if(error) {
            this.setState({customError: error});
        }
    };

    componentDidUpdate() {
        if (this.props.customError) {
            this.refs.inputText.classList.add('is-invalid');
        } else {
            this.refs.inputText.classList.remove('is-invalid');
        }
    };

    componentWillUnmount() {
        document.removeEventListener('click', this._handleDocumentClick);
    };

    getValue() {
        const {labelName, keyName, rawInputValue} = this.props;
        const {inputValue, selected, options, fromKeyResolver} = this.state;
        const resolvedLabel = options.get(selected);
        // The user cleared the field, return a null
        if (inputValue === '') {
            return null;
            // Value was received from the keyResolver, give it firectly
        } else if (fromKeyResolver) {
            return rawInputValue;
            // The user typed something without selecting any option, return a null
        } else if (resolvedLabel !== inputValue && selected !== inputValue) {
            return null;
            // The user selected an option (or no value was provided), return it
        } else {
            return selected || null;
        }
    };

    _handleDocumentClick = ({target}) => {
        const {focus, inputValue} = this.state;
        const {onBadInput} = this.props;
        if (focus) {
            const closestACParent = closest(target, `[data-id='${this.autocompleteId}']`, true);
            if(closestACParent === undefined) {
                this.setState({focus: false}, () => {
                    if (onBadInput && this.getValue() === null && inputValue !== '') {
                        onBadInput(inputValue);
                    }
                });
            }
        }
    };

    _handleQueryBlur = () => {
        const {onChange, onBadInput, onBlurError, customError} = this.props;
        if(this.state.suggestions.length === 1){
            this.setState({selected: this.state.suggestions[0].key, focus: false, inputValue: this.state.suggestions[0].label}, () => {
                if(onChange) onChange(this.state.suggestions[0].key);
            });
        } else {
            const {inputValue} = this.state;
            this.setState({focus: false,}, () => {
                if (onBadInput && this.getValue() === null && inputValue !== '') {
                    onBadInput(inputValue);
                }
            });
            if(onBlurError) onBlurError(customError);
        }
    };

    _handleQueryChange = ({target: {value}}) => {
        // the user cleared the input, don't call the querySearcher
        if (value === '') {
            const {onChange} = this.props;
            this.setState({inputValue: value, fromKeyResolver: false});
            if (onChange) onChange(null);
        } else {
            this.setState({inputValue: value, fromKeyResolver: false, isLoading: true});
            this._debouncedQuerySearcher(value);
        }
    };

    _querySearcher = value => {
        console.log('VALUE', value);
        const {querySearcher, keyName, labelName, onChange} = this.props;
        querySearcher(value).then(({data, totalCount}) => {
            // TODO handle the incomplete option list case
            const options = new Map();
            data.forEach(item => {
                options.set(item[keyName], item[labelName]);
            });
            this.setState({options, isLoading: false, totalCount, suggestions: data});
        }).catch(error => this.setState({customError: error.message}));
        onChange(value);
    };

    _handleQueryFocus = () => {
        this.refs.options.scrollTop = 0;
        if (this.props.onFocus) {
            this.props.onFocus.call(this);
        }
        this.setState({active: '', focus: true});
    };

    _handleQueryKeyDown = (event) => {
        event.stopPropagation();
        const {which} = event;
        const {active, options} = this.state;
        if (which === ENTER_KEY_CODE && active) this._select(active);
        if (which === TAB_KEY_CODE) {
            this.setState({focus: false});
            this.refs.htmlInput.blur();
        }
        // the user pressed on an arrow key, change the active key
        if ([DOWN_ARROW_KEY_CODE, UP_ARROW_KEY_CODE].indexOf(which) !== -1) {
            const optionKeys = [];
            for (let key of options.keys()) {
                optionKeys.push(key);
            }
            const currentIndex = optionKeys.indexOf(active);
            let newIndex = currentIndex + (which === DOWN_ARROW_KEY_CODE ? 1 : -1);
            if (newIndex >= options.size) {
                newIndex -= options.size
            }
            if (newIndex < 0) {
                newIndex += options.size;
            }
            this.setState({active: optionKeys[newIndex]});
        }
    };

    _handleSuggestionHover = key => {
        this.setState({active: key});
    };

    _select(key) {
        const {options} = this.state;
        const {onChange, keyName, labelName} = this.props;
        const resolvedLabel = options.get(key) || '';
        this.refs.htmlInput.blur();
        this.setState({inputValue: i18next.t(resolvedLabel), selected: key, focus: false}, () => {
            if (onChange) onChange(key);
        });
    };

    _renderOptions = () => {
        const {active, options, focus} = this.state;
        const renderedOptions = [];
        for (let [key, value] of options) {
            const isActive = active === key;
            renderedOptions.push(
                <li
                    data-active={isActive}
                    data-focus='option'
                    key={key}
                    onClick={this._select.bind(this, key)}
                    onMouseOver={this._handleSuggestionHover.bind(this, key)}
                    >
                    {i18next.t(value)}
                </li>
            );
        }
        return (
            <ul data-focus='options' ref='options' data-focussed={focus}>
                {renderedOptions}
            </ul>
        );
    };

    render () {
        const {customError, inputTimeout, keyName, keyResolver, labelName, placeholder, querySearcher, renderOptions, ...inputProps} = this.props;
        const {inputValue, isLoading} = this.state;
        const {_handleQueryFocus, _handleQueryKeyDown, _handleQueryChange, _handleQueryBlur} = this;
        return (
            <div data-focus='autocomplete' data-id={this.autocompleteId}>
                <div className={`mdl-textfield mdl-js-textfield${customError ? ' is-invalid' : ''}`} data-focus='input-text' ref='inputText'>
                    <div data-focus='loading' data-loading={isLoading} className='mdl-progress mdl-js-progress mdl-progress__indeterminate' ref='loader'></div>
                    <input
                        className='mdl-textfield__input'
                        {...inputProps}
                        onChange={_handleQueryChange}
                        onFocus={_handleQueryFocus}
                        onBlur={_handleQueryBlur}
                        onKeyDown={_handleQueryKeyDown}
                        ref='htmlInput'
                        type='text'
                        value={inputValue === undefined || inputValue === null ? '' : inputValue}
                        />
                    <label className='mdl-textfield__label'>{i18next.t(placeholder)}</label>
                    {customError && <span className='mdl-textfield__error'>{i18next.t(customError)}</span>}
                </div>
                {renderOptions ? renderOptions.call(this) : this._renderOptions()}
            </div>
        );
    };
}

Autocomplete.displayName = 'Autocomplete';
Autocomplete.propTypes = {
    customError: PropTypes.string,
    inputTimeout: PropTypes.number.isRequired,
    keyName: PropTypes.string.isRequired,
    keyResolver: PropTypes.func.isRequired,
    labelName: PropTypes.string.isRequired,
    onBadInput: PropTypes.func,
    onChange: PropTypes.func.isRequired,
    placeholder: PropTypes.string,
    querySearcher: PropTypes.func.isRequired,
    renderOptions: PropTypes.func,
    rawInputValue: PropTypes.string
};
Autocomplete.defaultProps = {
    keyName: 'key',
    labelName: 'label',
    inputTimeout: 200
};
export default Autocomplete;
