/** biome-ignore-all lint/correctness/useUniqueElementIds: StepForm.Step id is a step identifier, not a DOM id */
'use client'

import { api } from '@a/be-convex'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@a/ui/card'
import { FieldGroup } from '@a/ui/field'
import { Spinner } from '@a/ui/spinner'
import { defineSteps } from '@noboil/convex/components'
import { useMutation, useQuery } from 'convex/react'
import { toast } from 'sonner'

import { appearanceStep, orgStep, preferencesStep, profileStep } from '~/schema'

const { StepForm, useStepper } = defineSteps(
    { id: 'profile', label: 'Profile', schema: profileStep },
    { id: 'org', label: 'Organization', schema: orgStep },
    { id: 'appearance', label: 'Appearance', schema: appearanceStep },
    { id: 'preferences', label: 'Preferences', schema: preferencesStep }
  ),
  OnboardingPage = () => {
    const profile = useQuery(api.orgProfile.get, {}),
      upsert = useMutation(api.orgProfile.upsert),
      create = useMutation(api.org.create),
      stepper = useStepper({
        onSubmit: async d => {
          await upsert({ ...d.profile, ...d.preferences })
          await create({
            data: {
              avatarId: d.appearance.orgAvatar,
              name: d.org.name,
              slug: d.org.slug
            }
          })
        },
        onSuccess: () => {
          toast.success('Welcome aboard!')
          globalThis.location.href = '/'
        },
        values: profile
          ? {
              preferences: {
                notifications: profile.notifications,
                theme: profile.theme
              },
              profile: {
                avatar: profile.avatar ?? null,
                bio: profile.bio,
                displayName: profile.displayName
              }
            }
          : undefined
      })

    if (profile === undefined)
      return (
        <div className='flex min-h-[60vh] items-center justify-center'>
          <Spinner />
        </div>
      )

    return (
      <div className='container flex justify-center py-8'>
        <Card className='w-full max-w-2xl'>
          <CardHeader>
            <CardTitle>Welcome</CardTitle>
            <CardDescription>Set up your account in a few steps</CardDescription>
          </CardHeader>
          <CardContent>
            <StepForm stepper={stepper} submitLabel='Complete'>
              <StepForm.Step
                id='profile'
                render={({ File, Text }) => (
                  <FieldGroup>
                    <Text name='displayName' />
                    <Text multiline name='bio' />
                    <File accept='image/*' name='avatar' />
                  </FieldGroup>
                )}
              />
              <StepForm.Step
                id='org'
                render={({ Text }) => (
                  <FieldGroup>
                    <Text name='name' />
                    <Text label='URL Slug' name='slug' />
                  </FieldGroup>
                )}
              />
              <StepForm.Step
                id='appearance'
                render={({ File }) => (
                  <FieldGroup>
                    <File accept='image/*' label='Organization Avatar' name='orgAvatar' />
                  </FieldGroup>
                )}
              />
              <StepForm.Step
                id='preferences'
                render={({ Choose, Toggle }) => (
                  <FieldGroup>
                    <Choose name='theme' />
                    <Toggle falseLabel='Off' name='notifications' trueLabel='On' />
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
