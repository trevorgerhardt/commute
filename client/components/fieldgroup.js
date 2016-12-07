import React from 'react'
import {ControlLabel, FormControl, FormGroup, HelpBlock} from 'react-bootstrap'

export default function FieldGroup ({ help, label, name, ...props }) {
  return (
    <FormGroup controlId={`group-item-${name}`}>
      <ControlLabel>{label}</ControlLabel>
      <FormControl
        {...props}
        onChange={(e) => props.onChange(name, e)}
        value={props.value || ''}
        />
      {help && <HelpBlock>{help}</HelpBlock>}
    </FormGroup>
  )
}
