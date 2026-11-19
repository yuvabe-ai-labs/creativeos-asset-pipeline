"use client";

import type { ReactNode } from "react";
import { AtSignIcon } from "lucide-react";
import { CopilotTarget } from "@/components/journey/copilot-target";
import type { TargetState } from "@/hooks/use-follow-copilot";
import { kbTarget } from "@/lib/journey/kb-copilot/targets";
import { Label } from "@/components/ui/label";
import { InputGroup, InputGroupAddon, InputGroupInput, InputGroupText } from "@/components/ui/input-group";

type Props = {
  instagram: string;
  facebook: string;
  onInstagramChange: (value: string) => void;
  onFacebookChange: (value: string) => void;
  disabled?: boolean;
  /** When given, each handle is a target the copilot can save to, and shows that happening (D508). */
  stateOf?: (target: string) => TargetState;
};

/** The brand's Instagram and Facebook, collected beside the website for the asset import (D302).
 *  Anything people paste — "@handle", a profile URL — is accepted; the server normalises it. */
export function KBSocialHandleFields({ instagram, facebook, onInstagramChange, onFacebookChange, disabled, stateOf }: Props) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <Targeted name="instagram" stateOf={stateOf}>
      <HandleField
        id="instagram-handle"
        label="Instagram"
        prefix="instagram.com/"
        placeholder="yourbrand"
        value={instagram}
        onChange={onInstagramChange}
        disabled={disabled}
      />
      </Targeted>
      <Targeted name="facebook" stateOf={stateOf}>
      <HandleField
        id="facebook-handle"
        label="Facebook"
        prefix="facebook.com/"
        placeholder="yourbrand"
        value={facebook}
        onChange={onFacebookChange}
        disabled={disabled}
      />
      </Targeted>
    </div>
  );
}

/** A handle the copilot can save shows its work there (D508); with no `stateOf`, it is just the field. */
function Targeted({ name, stateOf, children }: { name: "instagram" | "facebook"; stateOf?: (target: string) => TargetState; children: ReactNode }) {
  if (!stateOf) return <>{children}</>;
  const id = kbTarget.form(name);
  return <CopilotTarget id={id} state={stateOf(id)} className="-mx-2 px-2 py-1">{children}</CopilotTarget>;
}

function HandleField(props: {
  id: string;
  label: string;
  prefix: string;
  placeholder: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={props.id} className="flex items-center gap-1.5 text-sm font-medium">
        <AtSignIcon className="size-3.5 text-muted-foreground" strokeWidth={1.5} />
        {props.label}
      </Label>
      <InputGroup>
        <InputGroupAddon>
          <InputGroupText>{props.prefix}</InputGroupText>
        </InputGroupAddon>
        <InputGroupInput
          id={props.id}
          placeholder={props.placeholder}
          value={props.value}
          onChange={(e) => props.onChange(e.target.value)}
          disabled={props.disabled}
          autoComplete="off"
        />
      </InputGroup>
    </div>
  );
}
