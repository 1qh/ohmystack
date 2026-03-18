// biome-ignore-all lint/nursery/useGlobalThis: browser API
'use client'

import { reducers, tables } from '@a/be-spacetimedb/spacetimedb'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@a/ui/card'
import { FieldGroup } from '@a/ui/field'
import { defineSteps } from '@noboil/spacetimedb/components'
import { useMut } from '@noboil/spacetimedb/react'
import { toast } from 'sonner'
import { useSpacetimeDB, useTable } from 'spacetimedb/react'

import { appearanceStep, orgStep, preferencesStep, profileStep } from '~/schema'

const { StepForm, useStepper } = defineSteps(
    { id: 'profile', label: 'Profile', schema: profileStep },
    { id: 'org', label: 'Organization', schema: orgStep },
    { id: 'appearance', label: 'Appearance', schema: appearanceStep },
    { id: 'preferences', label: 'Preferences', schema: preferencesStep }
  ),
  themeOptions = [
    { label: 'Light', value: 'light' },
    { label: 'Dark', value: 'dark' },
    { label: 'System', value: 'system' }
  ],
  OnboardingPage = () => {
    const { identity } = useSpacetimeDB(),
      [profiles] = useTable(tables.orgProfile),
      profile = identity ? profiles.find(p => p.userId.toHexString() === identity.toHexString()) : null,
      initialValues = {
        preferences: {
          notifications: profile?.notifications ?? false,
          theme: (profile?.theme as 'dark' | 'light' | 'system' | undefined) ?? 'system'
        },
        profile: {
          avatar: profile?.avatar ?? null,
          bio: profile?.bio,
          displayName: profile?.displayName ?? ''
        }
      },
      upsert = useMut(reducers.upsertOrgProfile, {
        toast: { error: 'Failed to save profile', success: 'Profile saved' }
      }),
      create = useMut(reducers.orgCreate, {
        toast: { error: 'Failed to create organization', success: 'Organization ready' }
      }),
      stepper = useStepper({
        onSubmit: async d => {
          await upsert({
            avatar: d.profile.avatar,
            bio: d.profile.bio,
            displayName: d.profile.displayName,
            notifications: d.preferences.notifications,
            theme: d.preferences.theme
          })
          await create({
            avatarId: d.appearance.orgAvatar,
            name: d.org.name,
            slug: d.org.slug
          })
        },
        onSuccess: () => {
          toast.success('Welcome aboard!')
          window.location.href = '/dashboard'
        },
        values: initialValues
      })

    return (
      <div className='container flex justify-center py-8'>
        <Card className='w-full max-w-2xl'>
          <CardHeader>
            <CardTitle>Welcome</CardTitle>
            <CardDescription>Set up your account in a few steps</CardDescription>
          </CardHeader>
          <CardContent>
            <StepForm stepper={stepper} submitLabel='Complete'>
              {/* biome-ignore lint/correctness/useUniqueElementIds: step identifier, not HTML id */}
              <StepForm.Step
                id='profile'
                render={({ File, Text }) => (
                  <FieldGroup>
                    <Text helpText='Visible to your organization.' name='displayName' required />
                    <Text helpText='Optional short bio.' multiline name='bio' />
                    <File accept='image/*' helpText='Optional avatar image.' name='avatar' />
                  </FieldGroup>
                )}
              />
              {/* biome-ignore lint/correctness/useUniqueElementIds: step identifier, not HTML id */}
              <StepForm.Step
                id='org'
                render={({ Text }) => (
                  <FieldGroup>
                    <Text helpText='Organization display name.' name='name' required />
                    <Text helpText='Lowercase letters, numbers, and dashes.' label='URL Slug' name='slug' required />
                  </FieldGroup>
                )}
              />
              {/* biome-ignore lint/correctness/useUniqueElementIds: step identifier, not HTML id */}
              <StepForm.Step
                id='appearance'
                render={({ File }) => (
                  <FieldGroup>
                    <File
                      accept='image/*'
                      helpText='Optional organization avatar.'
                      label='Organization Avatar'
                      name='orgAvatar'
                    />
                  </FieldGroup>
                )}
              />
              {/* biome-ignore lint/correctness/useUniqueElementIds: step identifier, not HTML id */}
              <StepForm.Step
                id='preferences'
                render={({ Choose, Toggle }) => (
                  <FieldGroup>
                    <Choose helpText='Pick your preferred theme.' name='theme' options={themeOptions} required />
                    <Toggle
                      falseLabel='Off'
                      helpText='Enable activity notifications.'
                      name='notifications'
                      trueLabel='On'
                    />
                  </FieldGroup>
                )}
              />
            </StepForm>
          </CardContent>
        </Card>
      </div>
    )
  }

export default OnboardingPage
