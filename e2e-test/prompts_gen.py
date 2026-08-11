from typing import Annotated, Final, Literal, NamedTuple, Optional, Type, Union
from pydantic import BaseModel, Field
from dataclasses import dataclass


class schema:
  class main:

    class T_Meta_Foobar:pass


    type T_Meta_ZooBar = Annotated[
      Union[
        'T_Meta_ZooBar_KindFoo',
        'T_Meta_ZooBar_KindBar',
      ],
      Field(discriminator="kind")
      ]

    class T_Meta(BaseModel):
      temperature: float
      foobar: 'schema.main.T_Meta_Foobar'
      zooBar: Optional['schema.main.T_Meta_ZooBar']



    class T_Meta_ZooBar_KindFoo(BaseModel):
      kind: Literal['foo']
      foo: str


    class T_Meta_ZooBar_KindBar(BaseModel):
      kind: Literal['bar']
      bar: str
