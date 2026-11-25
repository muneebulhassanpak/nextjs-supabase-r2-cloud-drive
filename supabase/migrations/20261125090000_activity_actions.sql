-- More kinds of activity. On their own: new enum values can't be used in the transaction that adds
-- them (the next migration does).
alter type public.activity_action add value 'deleted';
alter type public.activity_action add value 'invited';
alter type public.activity_action add value 'invite_changed';
alter type public.activity_action add value 'invite_removed';
alter type public.activity_action add value 'starred';
alter type public.activity_action add value 'unstarred';
alter type public.activity_action add value 'downloaded';
alter type public.activity_action add value 'signed_in';
alter type public.activity_action add value 'name_changed';
alter type public.activity_action add value 'picture_changed';
alter type public.activity_action add value 'password_changed';
